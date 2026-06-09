import { describe, it, expect, beforeEach } from 'vitest';
import type { AbstractServiceOptions, Item, SchemaOverview } from '@directus/types';
import type { ItemsServiceCtor } from '../types/directus-services';
import { createAutomatedExportBurstCoordinator } from './automated-export-burst-coordinator';
import type { AutomatedExportOutcome } from '@localazy/directus-common';
import type { AutomatedDeprecationOutcome } from '@localazy/directus-common';

type FakeRow = Record<string, unknown>;

const unused = (): never => {
  throw new Error('FakeService stub method called — not implemented in test fake');
};

function matchesFilter(row: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  for (const [field, predicate] of Object.entries(filter)) {
    const value = row[field];
    const pred = predicate as Record<string, unknown>;
    if ('_eq' in pred && value !== pred._eq) return false;
  }
  return true;
}

/**
 * In-memory `ItemsService` fake. Same shape as `shared/sync-log-storage.test.ts` and
 * `endpoint/orchestrator-adapters.test.ts`, but with read/filter support the coordinator
 * needs for its lazy sweep.
 */
function makeFakeItemsService(initial: Record<string, FakeRow[]>) {
  const tables = new Map<string, FakeRow[]>();
  for (const [k, v] of Object.entries(initial)) tables.set(k, [...v]);

  class FakeService<T extends Item = Item> {
    private collection: string;
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
    upsertOne = unused;
    upsertSingleton = unused;
    deleteByQuery = unused;
    deleteOne = unused;
    readSingleton = unused;
    deleteMany = unused;
    constructor(collection: string, _options: AbstractServiceOptions) {
      this.collection = collection;
    }
    async readByQuery(q: { filter?: Record<string, unknown>; sort?: string[]; limit?: number; fields?: string[] } = {}): Promise<T[]> {
      let list = ((tables.get(this.collection) ?? []) as T[]).slice();
      if (q.filter) {
        list = list.filter((row) => matchesFilter(row as Record<string, unknown>, q.filter ?? {}));
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
  }
  return { FakeService, tables };
}

/**
 * Test harness for the idle timer. Captures every scheduled callback; tests fire them
 * manually by calling `runPending`. Mirrors the real `setTimeout` API surface enough that
 * the coordinator's `clearTimeoutFn` path works.
 */
function makeFakeTimer() {
  let nextId = 1;
  const pending = new Map<number, () => void>();
  function setTimeoutFn(cb: () => void, _ms: number): ReturnType<typeof setTimeout> {
    const id = nextId++;
    pending.set(id, cb);
    // The coordinator types this as `ReturnType<typeof setTimeout>`. Node's `setTimeout`
    // returns a `Timeout` object; cast through unknown so the structural shape matches.
    return id as unknown as ReturnType<typeof setTimeout>;
  }
  function clearTimeoutFn(handle: ReturnType<typeof setTimeout>) {
    const id = handle as unknown as number;
    pending.delete(id);
  }
  /** Fire whichever scheduled callback is still pending — the coordinator only ever has one active timer. */
  async function runPending() {
    const entries = Array.from(pending.entries());
    for (const [id, cb] of entries) {
      pending.delete(id);
      cb();
      // Yield so the coordinator's withLock+finish chain runs to completion before the
      // test inspects state.
      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));
    }
  }
  return { setTimeoutFn, clearTimeoutFn, runPending, pendingCount: () => pending.size };
}

const schema: SchemaOverview = { collections: {}, relations: [] };

let idCounter = 0;
function generateId() {
  idCounter += 1;
  return `sess-${idCounter}`;
}

beforeEach(() => {
  idCounter = 0;
});

/**
 * Convenience: build a coordinator + its test scaffolding, returning everything tests
 * need to inspect (rows table, timer fakes, the coordinator surface).
 */
function setup(initialRows: FakeRow[] = []) {
  const fake = makeFakeItemsService({ localazy_sync_log: initialRows });
  const timer = makeFakeTimer();
  const coordinator = createAutomatedExportBurstCoordinator({
    ItemsService: fake.FakeService as ItemsServiceCtor,
    generateId,
    idleWindowMs: 30_000,
    now: () => Date.parse('2026-05-19T10:00:00.000Z'),
    setTimeoutFn: timer.setTimeoutFn,
    clearTimeoutFn: timer.clearTimeoutFn,
  });
  return { fake, timer, coordinator };
}

describe('createAutomatedExportBurstCoordinator', () => {
  describe('Q3 outcome filter', () => {
    it('opens a burst on an exported outcome', async () => {
      const { fake, coordinator } = setup();
      const outcome: AutomatedExportOutcome = { kind: 'exported', itemsProcessed: 3 };

      await coordinator.recordExportOutcome({
        outcome,
        schema,
        event: 'items.update',
        collection: 'articles',
        keys: ['a1', 'a2', 'a3'],
        userId: 'user-1',
      });

      const rows = fake.tables.get('localazy_sync_log') ?? [];
      expect(rows).toHaveLength(1);
      expect(rows[0]?.event_type).toBe('upload-automated');
      expect(rows[0]?.initiator).toBe('hook');
      expect(rows[0]?.initiator_user).toBeNull();
      expect(rows[0]?.status).toBe('in_progress');
    });

    it.each(['nothing-to-export', 'missing-context', 'export-disabled'] as const)(
      'silently drops the %s export outcome (no burst opens)',
      async (kind) => {
        const { fake, coordinator } = setup();

        await coordinator.recordExportOutcome({
          outcome: { kind } as AutomatedExportOutcome,
          schema,
          event: 'items.update',
          collection: 'articles',
          keys: ['a1'],
          userId: null,
        });

        expect(fake.tables.get('localazy_sync_log') ?? []).toHaveLength(0);
      },
    );

    it.each(['failed', 'no-project', 'payment-disabled'] as const)('opens a burst on the %s export outcome', async (kind) => {
      const { fake, coordinator } = setup();
      const outcome = kind === 'failed' ? { kind, error: new Error('boom') } : ({ kind } as AutomatedExportOutcome);

      await coordinator.recordExportOutcome({
        outcome: outcome as AutomatedExportOutcome,
        schema,
        event: 'items.update',
        collection: 'articles',
        keys: ['a1'],
        userId: null,
      });

      expect(fake.tables.get('localazy_sync_log') ?? []).toHaveLength(1);
    });

    it('silently drops a deprecated outcome when keysCount/itemsProcessed are zero', async () => {
      const { fake, coordinator } = setup();

      await coordinator.recordDeprecationOutcome({
        outcome: { kind: 'deprecated', keysCount: 0, itemsProcessed: 0 },
        schema,
        event: 'items.delete',
        collection: 'articles',
        keys: ['a1'],
        userId: null,
      });

      expect(fake.tables.get('localazy_sync_log') ?? []).toHaveLength(0);
    });

    it.each(['missing-context', 'deprecation-disabled'] as const)('silently drops the %s deprecation outcome', async (kind) => {
      const { fake, coordinator } = setup();

      await coordinator.recordDeprecationOutcome({
        outcome: { kind } as AutomatedDeprecationOutcome,
        schema,
        event: 'items.delete',
        collection: 'articles',
        keys: ['a1'],
        userId: null,
      });

      expect(fake.tables.get('localazy_sync_log') ?? []).toHaveLength(0);
    });
  });

  describe('coalescing within the idle window', () => {
    it('extends the same burst across multiple events without firing the timer', async () => {
      const { fake, timer, coordinator } = setup();
      const outcome: AutomatedExportOutcome = { kind: 'exported', itemsProcessed: 2 };

      await coordinator.recordExportOutcome({
        outcome,
        schema,
        event: 'items.update',
        collection: 'articles',
        keys: ['a1', 'a2'],
        userId: 'user-1',
      });
      await coordinator.recordExportOutcome({
        outcome: { kind: 'exported', itemsProcessed: 1 },
        schema,
        event: 'items.update',
        collection: 'articles',
        keys: ['a3'],
        userId: 'user-2',
      });

      const rows = fake.tables.get('localazy_sync_log') ?? [];
      expect(rows).toHaveLength(1);
      // The timer was extended exactly once (the second event clears + reschedules); the
      // pending count stays at 1 throughout.
      expect(timer.pendingCount()).toBe(1);

      // Two append cycles landed two entries on the row.
      const entries = JSON.parse((rows[0]?.entries ?? '[]') as string);
      expect(entries).toHaveLength(2);
      expect(entries[0].data.user).toBe('user-1');
      expect(entries[1].data.user).toBe('user-2');
    });

    it('opens a new burst when the timer fires before the next event', async () => {
      const { fake, timer, coordinator } = setup();

      await coordinator.recordExportOutcome({
        outcome: { kind: 'exported', itemsProcessed: 1 },
        schema,
        event: 'items.update',
        collection: 'articles',
        keys: ['a1'],
        userId: null,
      });
      await timer.runPending(); // burst 1 closes
      await coordinator.recordExportOutcome({
        outcome: { kind: 'exported', itemsProcessed: 1 },
        schema,
        event: 'items.update',
        collection: 'articles',
        keys: ['a2'],
        userId: null,
      });

      const rows = fake.tables.get('localazy_sync_log') ?? [];
      expect(rows).toHaveLength(2);
      expect(rows[0]?.id).toBe('sess-1');
      expect(rows[1]?.id).toBe('sess-2');
    });
  });

  describe('terminal status derivation on timer fire', () => {
    it("finalises a single-exported burst as 'completed'", async () => {
      const { fake, timer, coordinator } = setup();

      await coordinator.recordExportOutcome({
        outcome: { kind: 'exported', itemsProcessed: 5 },
        schema,
        event: 'items.update',
        collection: 'articles',
        keys: ['a1', 'a2', 'a3', 'a4', 'a5'],
        userId: null,
      });
      await timer.runPending();

      const rows = fake.tables.get('localazy_sync_log') ?? [];
      expect(rows[0]?.status).toBe('completed');
      expect(rows[0]?.items_processed).toBe(5);
      expect(rows[0]?.summary).toBe('Exported 5 items across 1 event');
    });

    it("finalises a mixed export+deprecation burst as 'completed' with both counters in the summary", async () => {
      const { fake, timer, coordinator } = setup();

      await coordinator.recordExportOutcome({
        outcome: { kind: 'exported', itemsProcessed: 2 },
        schema,
        event: 'items.update',
        collection: 'articles',
        keys: ['a1', 'a2'],
        userId: null,
      });
      await coordinator.recordDeprecationOutcome({
        outcome: { kind: 'deprecated', keysCount: 3, itemsProcessed: 3 },
        schema,
        event: 'items.delete',
        collection: 'articles',
        keys: ['del-1', 'del-2', 'del-3'],
        userId: null,
      });
      await timer.runPending();

      const rows = fake.tables.get('localazy_sync_log') ?? [];
      expect(rows[0]?.status).toBe('completed');
      expect(rows[0]?.items_processed).toBe(5);
      expect(rows[0]?.summary).toBe('Exported 2 items, deprecated 3 keys across 2 events');
    });

    it("finalises a mixed-success burst as 'partial'", async () => {
      const { fake, timer, coordinator } = setup();

      await coordinator.recordExportOutcome({
        outcome: { kind: 'exported', itemsProcessed: 1 },
        schema,
        event: 'items.update',
        collection: 'articles',
        keys: ['a1'],
        userId: null,
      });
      await coordinator.recordExportOutcome({
        outcome: { kind: 'failed', error: new Error('boom') },
        schema,
        event: 'items.update',
        collection: 'news',
        keys: ['n1'],
        userId: null,
      });
      await timer.runPending();

      const rows = fake.tables.get('localazy_sync_log') ?? [];
      expect(rows[0]?.status).toBe('partial');
      expect(rows[0]?.items_processed).toBe(1);
      expect(rows[0]?.summary).toBe('Exported 1 item across 1 event; 1 failed');
    });

    it("finalises an all-failure burst as 'failed'", async () => {
      const { fake, timer, coordinator } = setup();

      await coordinator.recordExportOutcome({
        outcome: { kind: 'failed', error: new Error('boom') },
        schema,
        event: 'items.update',
        collection: 'articles',
        keys: ['a1'],
        userId: null,
      });
      await coordinator.recordExportOutcome({
        outcome: { kind: 'no-project' },
        schema,
        event: 'items.update',
        collection: 'news',
        keys: ['n1'],
        userId: null,
      });
      await timer.runPending();

      const rows = fake.tables.get('localazy_sync_log') ?? [];
      expect(rows[0]?.status).toBe('failed');
      expect(rows[0]?.items_processed).toBe(0);
      expect(rows[0]?.summary).toBe('All 2 events failed');
    });
  });

  describe('lazy sweep of orphan in_progress rows', () => {
    it('finalises orphan upload-automated rows as aborted on the first event after bundle init', async () => {
      const orphans: FakeRow[] = [
        { id: 'orphan-1', event_type: 'upload-automated', status: 'in_progress', started_at: '2026-05-19T09:00:00.000Z' },
        { id: 'orphan-2', event_type: 'upload-automated', status: 'in_progress', started_at: '2026-05-19T09:30:00.000Z' },
      ];
      const { fake, coordinator } = setup(orphans);

      await coordinator.recordExportOutcome({
        outcome: { kind: 'exported', itemsProcessed: 1 },
        schema,
        event: 'items.update',
        collection: 'articles',
        keys: ['a1'],
        userId: null,
      });

      const rows = fake.tables.get('localazy_sync_log') ?? [];
      const o1 = rows.find((r) => r.id === 'orphan-1');
      const o2 = rows.find((r) => r.id === 'orphan-2');
      expect(o1?.status).toBe('aborted');
      expect(o1?.summary).toBe('Bundle restarted before burst completed');
      expect(o2?.status).toBe('aborted');
    });

    it('runs the sweep only once across the coordinator lifetime', async () => {
      const fake = makeFakeItemsService({
        localazy_sync_log: [
          { id: 'orphan-1', event_type: 'upload-automated', status: 'in_progress', started_at: '2026-05-19T09:00:00.000Z' },
        ],
      });
      const timer = makeFakeTimer();
      const coordinator = createAutomatedExportBurstCoordinator({
        ItemsService: fake.FakeService as ItemsServiceCtor,
        generateId,
        idleWindowMs: 30_000,
        now: () => Date.parse('2026-05-19T10:00:00.000Z'),
        setTimeoutFn: timer.setTimeoutFn,
        clearTimeoutFn: timer.clearTimeoutFn,
      });

      // First event sweeps.
      await coordinator.recordExportOutcome({
        outcome: { kind: 'exported', itemsProcessed: 1 },
        schema,
        event: 'items.update',
        collection: 'articles',
        keys: ['a1'],
        userId: null,
      });
      // Inject a second orphan after the sweep — it should NOT get cleaned up because
      // the sweep already ran.
      fake.tables.get('localazy_sync_log')?.push({
        id: 'orphan-2',
        event_type: 'upload-automated',
        status: 'in_progress',
        started_at: '2026-05-19T09:45:00.000Z',
      });
      await coordinator.recordExportOutcome({
        outcome: { kind: 'exported', itemsProcessed: 1 },
        schema,
        event: 'items.update',
        collection: 'articles',
        keys: ['a2'],
        userId: null,
      });

      const orphan2 = (fake.tables.get('localazy_sync_log') ?? []).find((r) => r.id === 'orphan-2');
      expect(orphan2?.status).toBe('in_progress'); // untouched
    });

    it('leaves non-burst event_types alone during the sweep', async () => {
      const fake = makeFakeItemsService({
        localazy_sync_log: [
          { id: 'webhook-1', event_type: 'webhook', status: 'in_progress', started_at: '2026-05-19T09:00:00.000Z' },
          { id: 'download-1', event_type: 'download-incremental', status: 'in_progress', started_at: '2026-05-19T09:00:00.000Z' },
        ],
      });
      const timer = makeFakeTimer();
      const coordinator = createAutomatedExportBurstCoordinator({
        ItemsService: fake.FakeService as ItemsServiceCtor,
        generateId,
        idleWindowMs: 30_000,
        now: () => Date.parse('2026-05-19T10:00:00.000Z'),
        setTimeoutFn: timer.setTimeoutFn,
        clearTimeoutFn: timer.clearTimeoutFn,
      });

      await coordinator.recordExportOutcome({
        outcome: { kind: 'exported', itemsProcessed: 1 },
        schema,
        event: 'items.update',
        collection: 'articles',
        keys: ['a1'],
        userId: null,
      });

      const rows = fake.tables.get('localazy_sync_log') ?? [];
      expect(rows.find((r) => r.id === 'webhook-1')?.status).toBe('in_progress');
      expect(rows.find((r) => r.id === 'download-1')?.status).toBe('in_progress');
    });
  });

  describe('per-entry message format', () => {
    it('uses an "Exported" verb for export outcomes and "Deprecated" for deprecation outcomes', async () => {
      const { fake, timer, coordinator } = setup();

      await coordinator.recordExportOutcome({
        outcome: { kind: 'exported', itemsProcessed: 1 },
        schema,
        event: 'items.update',
        collection: 'articles',
        keys: ['a1'],
        userId: 'u1',
      });
      await coordinator.recordDeprecationOutcome({
        outcome: { kind: 'deprecated', keysCount: 2, itemsProcessed: 2 },
        schema,
        event: 'items.delete',
        collection: 'articles',
        keys: ['d1', 'd2'],
        userId: 'u2',
      });
      await timer.runPending();

      const rows = fake.tables.get('localazy_sync_log') ?? [];
      const entries = JSON.parse((rows[0]?.entries ?? '[]') as string);
      expect(entries[0].message).toBe('Exported articles content for 1 item (a1)');
      expect(entries[0].data.user).toBe('u1');
      expect(entries[0].data.event).toBe('items.update');
      expect(entries[0].data.outcome).toBe('exported');
      // Deprecation messages count Localazy keys (operationally meaningful), not the
      // Directus item deletions that triggered them. Item ids stay in `data.keys` for
      // debugging.
      expect(entries[1].message).toBe('Deprecated 2 keys in articles (triggered by deletion of 2 items)');
      expect(entries[1].data.user).toBe('u2');
      expect(entries[1].data.outcome).toBe('deprecated');
      expect(entries[1].data.keys).toEqual(['d1', 'd2']);
    });
  });
});
