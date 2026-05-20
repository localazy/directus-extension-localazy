import { describe, expect, it } from 'vitest';
import { createBrowserSyncLogStorage, createSyncLogWriter, SyncLogHttpClient } from './sync-log-writer';
import type { SyncLogEntry, SyncLogSession } from '../../../common/models/collections-data/sync-log';

/* -------------------------------------------------------------------------- */
/*  Storage-adapter focus                                                     */
/* -------------------------------------------------------------------------- */
/*  The deep writer's orchestration (per-session append chain, retention      */
/*  trim, swallow contract, onFailure semantics) is covered in                */
/*  extensions/common/services/orchestrator/sync-log-writer.test.ts. These    */
/*  tests focus on the browser storage adapter: that each SyncLogStorage      */
/*  method maps to the correct axios call shape, plus one end-to-end probe    */
/*  through the convenience `createSyncLogWriter` wrapper.                    */
/* -------------------------------------------------------------------------- */

type CallLog = {
  posts: Array<{ url: string; data: unknown }>;
  patches: Array<{ url: string; data: unknown }>;
  gets: Array<{ url: string; params: Record<string, unknown> | undefined }>;
  deletes: Array<{ url: string; data: unknown }>;
};

function makeFakeApi(seedRows: Array<{ id: string; entries: string; started_at: string }> = []): {
  api: SyncLogHttpClient;
  calls: CallLog;
  rows: Map<string, { id: string; entries: string; started_at: string }>;
} {
  const rows = new Map<string, { id: string; entries: string; started_at: string }>();
  seedRows.forEach((r) => rows.set(r.id, { ...r }));
  const calls: CallLog = { posts: [], patches: [], gets: [], deletes: [] };

  const api: SyncLogHttpClient = {
    async post(url, data) {
      calls.posts.push({ url, data });
      const row = data as { id: string; entries?: string; started_at?: string };
      rows.set(row.id, { id: row.id, entries: row.entries ?? '[]', started_at: row.started_at ?? new Date().toISOString() });
      return { data: { data: { id: row.id } } };
    },
    async patch(url, data) {
      calls.patches.push({ url, data });
      const match = /\/items\/[^/]+\/(.+)$/.exec(url);
      const id = match?.[1];
      if (id && rows.has(id)) {
        const existing = rows.get(id)!;
        const patch = data as Record<string, unknown>;
        if (typeof patch.entries === 'string') existing.entries = patch.entries;
        rows.set(id, existing);
      }
      return {};
    },
    async get(url, config) {
      calls.gets.push({ url, params: config?.params });
      const matchSingle = /\/items\/[^/]+\/(.+)$/.exec(url);
      if (matchSingle) {
        const id = matchSingle[1]!;
        return { data: { data: rows.get(id) ?? null } };
      }
      const sorted = Array.from(rows.values()).sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
      return { data: { data: sorted.map((r) => ({ id: r.id, entries: r.entries })) } };
    },
    async delete(url, config) {
      calls.deletes.push({ url, data: config?.data });
      const ids = (config?.data as string[]) ?? [];
      ids.forEach((id) => rows.delete(id));
      return {};
    },
  };

  return { api, calls, rows };
}

describe('createBrowserSyncLogStorage', () => {
  it('createSession POSTs the full row payload to /items/{collection}', async () => {
    const { api, calls } = makeFakeApi();
    const storage = createBrowserSyncLogStorage(api, 'localazy_sync_log');
    const row: SyncLogSession = {
      id: 'sess-1',
      event_type: 'download-incremental',
      status: 'in_progress',
      started_at: '2026-05-12T00:00:00Z',
      finished_at: null,
      initiator: 'user-1',
      initiator_user: 'user-1',
      summary: '',
      items_processed: 0,
      entries: '[]',
    };

    await storage.createSession(row);

    expect(calls.posts).toHaveLength(1);
    expect(calls.posts[0]!.url).toBe('/items/localazy_sync_log');
    expect(calls.posts[0]!.data).toEqual(row);
  });

  it('readEntries returns the entries column from the row response', async () => {
    const { api } = makeFakeApi([{ id: 'sess-1', entries: '[{"message":"x"}]', started_at: '2026-05-12T00:00:00Z' }]);
    const storage = createBrowserSyncLogStorage(api, 'localazy_sync_log');
    const entries = await storage.readEntries('sess-1');
    expect(entries).toBe('[{"message":"x"}]');
  });

  it('readEntries defaults to "[]" when the row has no entries column', async () => {
    const { api } = makeFakeApi();
    // GET on a missing row returns null; the adapter must convert that to '[]'.
    const storage = createBrowserSyncLogStorage(api, 'localazy_sync_log');
    expect(await storage.readEntries('missing')).toBe('[]');
  });

  it('writeEntries PATCHes only the entries column', async () => {
    const { api, calls } = makeFakeApi();
    const storage = createBrowserSyncLogStorage(api, 'localazy_sync_log');
    await storage.writeEntries('sess-1', '[{"message":"y"}]');
    expect(calls.patches).toHaveLength(1);
    expect(calls.patches[0]!.url).toBe('/items/localazy_sync_log/sess-1');
    expect(calls.patches[0]!.data).toEqual({ entries: '[{"message":"y"}]' });
  });

  it('writeFinish PATCHes the terminal fields verbatim', async () => {
    const { api, calls } = makeFakeApi();
    const storage = createBrowserSyncLogStorage(api, 'localazy_sync_log');
    await storage.writeFinish('sess-1', {
      status: 'completed',
      finished_at: '2026-05-12T00:01:00Z',
      summary: 'all good',
      items_processed: 7,
    });
    expect(calls.patches).toHaveLength(1);
    expect(calls.patches[0]!.url).toBe('/items/localazy_sync_log/sess-1');
    expect(calls.patches[0]!.data).toEqual({
      status: 'completed',
      finished_at: '2026-05-12T00:01:00Z',
      summary: 'all good',
      items_processed: 7,
    });
  });

  it('listIdsByStartedAtDesc GETs with limit=-1, sort=-started_at, fields=[id]', async () => {
    const { api, calls } = makeFakeApi([
      { id: 'older', entries: '[]', started_at: '2026-01-01T00:00:00Z' },
      { id: 'newer', entries: '[]', started_at: '2026-02-01T00:00:00Z' },
    ]);
    const storage = createBrowserSyncLogStorage(api, 'localazy_sync_log');
    const ids = await storage.listIdsByStartedAtDesc();
    expect(ids).toEqual(['newer', 'older']);
    expect(calls.gets).toHaveLength(1);
    expect(calls.gets[0]!.url).toBe('/items/localazy_sync_log');
    expect(calls.gets[0]!.params).toEqual({ limit: -1, sort: '-started_at', fields: ['id'] });
  });

  it('deleteByIds DELETEs with the id list in the request body', async () => {
    const { api, calls } = makeFakeApi();
    const storage = createBrowserSyncLogStorage(api, 'localazy_sync_log');
    await storage.deleteByIds(['a', 'b', 'c']);
    expect(calls.deletes).toHaveLength(1);
    expect(calls.deletes[0]!.url).toBe('/items/localazy_sync_log');
    expect(calls.deletes[0]!.data).toEqual(['a', 'b', 'c']);
  });
});

describe('createSyncLogWriter (module convenience wrapper)', () => {
  it('threads a session through start → append → finish via the deep writer', async () => {
    let counter = 0;
    const { api, rows } = makeFakeApi();
    const writer = createSyncLogWriter({
      api,
      collectionName: 'localazy_sync_log',
      generateId: () => `s-${++counter}`,
    });

    const id = await writer.startSession({ eventType: 'download-incremental', initiator: 'u', initiatorUser: 'u' });
    expect(id).toBe('s-1');
    await writer.appendEntry(id, { timestamp: 't', level: 'info', message: 'one' });
    await writer.finish(id, { status: 'completed', summary: 'done', itemsProcessed: 1 });

    const stored = JSON.parse(rows.get(id)!.entries) as SyncLogEntry[];
    expect(stored.map((e) => e.message)).toEqual(['one']);
  });
});
