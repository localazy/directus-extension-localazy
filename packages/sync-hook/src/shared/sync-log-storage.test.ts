import { describe, it, expect, beforeEach } from 'vitest';
import type { AbstractServiceOptions, Item } from '@directus/types';
import type { ItemsServiceCtor } from '../hook/types/directus-services';
import { createServerSyncLogStorage } from './sync-log-storage';

type FakeRow = Record<string, unknown>;

const unused = (): never => {
  throw new Error('FakeService stub method called — not implemented in test fake');
};

/**
 * Minimal in-memory `ItemsService` fake — same shape as the larger fake in
 * `orchestrator-adapters.test.ts` but trimmed to the surface this storage adapter
 * actually touches (`createOne`, `readOne`, `updateOne`, `readByQuery`, `deleteMany`).
 * Local to this file on purpose: the storage adapter is a tight contract, the fake
 * stays small and readable.
 */
function makeFakeItemsService(initial: Record<string, FakeRow[]>) {
  const tables = new Map<string, FakeRow[]>();
  for (const [k, v] of Object.entries(initial)) tables.set(k, [...v]);
  const ctorCalls: Array<{ collection: string; options: AbstractServiceOptions }> = [];

  class FakeService<T extends Item = Item, Collection extends string = string> {
    private collection: Collection;
    readonly knex = unused as never;
    readonly accountability = null;
    readonly nested: string[] = [];
    getKeysByQuery = unused;
    createMany = unused;
    readMany = unused;
    updateByQuery = unused;
    updateBatch = unused;
    updateMany = unused;
    upsertMany = unused;
    deleteByQuery = unused;
    deleteOne = unused;
    readSingleton = unused;
    upsertOne = unused;
    upsertSingleton = unused;
    constructor(collection: Collection, options: AbstractServiceOptions) {
      this.collection = collection;
      ctorCalls.push({ collection, options });
    }
    async readByQuery(q: { sort?: string[]; fields?: string[]; limit?: number } = {}): Promise<T[]> {
      let list = ((tables.get(this.collection) ?? []) as T[]).slice();
      const sortKey = q.sort?.[0];
      if (sortKey) {
        const desc = sortKey.startsWith('-');
        const key = desc ? sortKey.slice(1) : sortKey;
        list.sort((a, b) => {
          const av = (a as Record<string, unknown>)[key];
          const bv = (b as Record<string, unknown>)[key];
          if (av == null && bv == null) return 0;
          if (av == null) return desc ? 1 : -1;
          if (bv == null) return desc ? -1 : 1;
          if (av < bv) return desc ? 1 : -1;
          if (av > bv) return desc ? -1 : 1;
          return 0;
        });
      }
      if (typeof q.limit === 'number' && q.limit >= 0) {
        list = list.slice(0, q.limit);
      }
      return list;
    }
    async readOne(id: string | number): Promise<T | null> {
      const row = (tables.get(this.collection) ?? []).find((r) => r.id === id);
      return (row as T | undefined) ?? null;
    }
    async createOne(data: Partial<T>) {
      const list = tables.get(this.collection) ?? [];
      list.push(data as FakeRow);
      tables.set(this.collection, list);
      return data.id as string;
    }
    async updateOne(id: string | number, data: Partial<T>) {
      const list = tables.get(this.collection) ?? [];
      const idx = list.findIndex((r) => r.id === id);
      if (idx >= 0) list[idx] = { ...list[idx], ...data };
      return id;
    }
    async deleteMany(ids: Array<string | number>) {
      const list = tables.get(this.collection) ?? [];
      const kept = list.filter((r) => !ids.includes(r.id as string | number));
      tables.set(this.collection, kept);
      return ids;
    }
  }

  return { FakeService, tables, ctorCalls };
}

const schema = { collections: {}, relations: [] };

describe('createServerSyncLogStorage', () => {
  let fake: ReturnType<typeof makeFakeItemsService>;

  beforeEach(() => {
    fake = makeFakeItemsService({ localazy_sync_log: [] });
  });

  it("createSession writes the row to the 'localazy_sync_log' collection with admin accountability", async () => {
    const storage = createServerSyncLogStorage(fake.FakeService as ItemsServiceCtor, schema);

    await storage.createSession({
      id: 'sess-1',
      event_type: 'upload-automated',
      status: 'in_progress',
      started_at: '2026-05-19T10:00:00.000Z',
      finished_at: null,
      initiator: 'hook',
      initiator_user: null,
      summary: '',
      items_processed: 0,
      entries: '[]',
    });

    const rows = fake.tables.get('localazy_sync_log') ?? [];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe('sess-1');
    expect(rows[0]?.event_type).toBe('upload-automated');
    // The Sync-log table is extension-internal — every write runs as admin
    // (`accountability: null`), regardless of who triggered the hook event.
    const lastCtor = fake.ctorCalls.at(-1);
    expect(lastCtor?.collection).toBe('localazy_sync_log');
    expect(lastCtor?.options.accountability).toBeNull();
  });

  it("readEntries returns the row's entries string and defaults to '[]' when missing", async () => {
    fake.tables.set('localazy_sync_log', [
      { id: 'sess-1', entries: '[{"timestamp":"t1","level":"info","message":"hi"}]' },
      { id: 'sess-2' /* no entries field */ },
    ]);
    const storage = createServerSyncLogStorage(fake.FakeService as ItemsServiceCtor, schema);

    expect(await storage.readEntries('sess-1')).toBe('[{"timestamp":"t1","level":"info","message":"hi"}]');
    expect(await storage.readEntries('sess-2')).toBe('[]');
  });

  it('writeEntries overwrites the entries column on the existing row', async () => {
    fake.tables.set('localazy_sync_log', [{ id: 'sess-1', entries: '[]' }]);
    const storage = createServerSyncLogStorage(fake.FakeService as ItemsServiceCtor, schema);

    await storage.writeEntries('sess-1', '[{"timestamp":"t1","level":"info","message":"new"}]');

    const row = fake.tables.get('localazy_sync_log')?.[0];
    expect(row?.entries).toBe('[{"timestamp":"t1","level":"info","message":"new"}]');
  });

  it('writeFinish patches the terminal-state fields', async () => {
    fake.tables.set('localazy_sync_log', [{ id: 'sess-1', status: 'in_progress', summary: '', items_processed: 0 }]);
    const storage = createServerSyncLogStorage(fake.FakeService as ItemsServiceCtor, schema);

    await storage.writeFinish('sess-1', {
      status: 'completed',
      finished_at: '2026-05-19T10:05:00.000Z',
      summary: 'Exported 3 items',
      items_processed: 3,
    });

    const row = fake.tables.get('localazy_sync_log')?.[0];
    expect(row?.status).toBe('completed');
    expect(row?.finished_at).toBe('2026-05-19T10:05:00.000Z');
    expect(row?.summary).toBe('Exported 3 items');
    expect(row?.items_processed).toBe(3);
  });

  it('listIdsByStartedAtDesc returns row ids sorted newest first', async () => {
    fake.tables.set('localazy_sync_log', [
      { id: 'old', started_at: '2026-01-01T00:00:00.000Z' },
      { id: 'new', started_at: '2026-05-01T00:00:00.000Z' },
      { id: 'mid', started_at: '2026-03-01T00:00:00.000Z' },
    ]);
    const storage = createServerSyncLogStorage(fake.FakeService as ItemsServiceCtor, schema);

    const ids = await storage.listIdsByStartedAtDesc();
    expect(ids).toEqual(['new', 'mid', 'old']);
  });

  it('deleteByIds removes the listed ids from the collection', async () => {
    fake.tables.set('localazy_sync_log', [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    const storage = createServerSyncLogStorage(fake.FakeService as ItemsServiceCtor, schema);

    await storage.deleteByIds(['a', 'c']);

    const ids = (fake.tables.get('localazy_sync_log') ?? []).map((r) => r.id);
    expect(ids).toEqual(['b']);
  });
});
