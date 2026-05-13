import { describe, expect, it } from 'vitest';
import { appendEntryToJson, createSyncLogWriter, idsToTrim, SyncLogHttpClient } from './sync-log-writer';
import type { SyncLogEntry } from '../../../common/models/collections-data/sync-log';

/* -------------------------------------------------------------------------- */
/*  Pure helpers                                                              */
/* -------------------------------------------------------------------------- */

describe('appendEntryToJson', () => {
  const entry: SyncLogEntry = { timestamp: '2026-05-12T12:00:00Z', level: 'info', message: 'hello' };

  it('starts from an empty array when the input is empty', () => {
    const result = appendEntryToJson('', entry);
    expect(JSON.parse(result)).toEqual([entry]);
  });

  it('appends to a non-empty array', () => {
    const existing: SyncLogEntry[] = [{ timestamp: '2026-05-12T11:59:59Z', level: 'info', message: 'first' }];
    const result = appendEntryToJson(JSON.stringify(existing), entry);
    expect(JSON.parse(result)).toEqual([...existing, entry]);
  });

  it('treats corrupted JSON as an empty array', () => {
    const result = appendEntryToJson('not json', entry);
    expect(JSON.parse(result)).toEqual([entry]);
  });

  it('treats a non-array JSON value as an empty array', () => {
    const result = appendEntryToJson(JSON.stringify({ not: 'an array' }), entry);
    expect(JSON.parse(result)).toEqual([entry]);
  });
});

describe('idsToTrim', () => {
  it('returns [] when below the retention threshold', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `id-${i}`);
    expect(idsToTrim(ids)).toEqual([]);
  });

  it('returns [] at exactly 100 rows', () => {
    const ids = Array.from({ length: 100 }, (_, i) => `id-${i}`);
    expect(idsToTrim(ids)).toEqual([]);
  });

  it('returns the overflow when above 100 rows', () => {
    const ids = Array.from({ length: 105 }, (_, i) => `id-${i}`);
    // Inputs are newest-first; the oldest 5 (indices 100..104) should be trimmed.
    expect(idsToTrim(ids)).toEqual(['id-100', 'id-101', 'id-102', 'id-103', 'id-104']);
  });
});

/* -------------------------------------------------------------------------- */
/*  Adapter integration                                                       */
/* -------------------------------------------------------------------------- */

type CallLog = {
  posts: Array<{ url: string; data: unknown }>;
  patches: Array<{ url: string; data: unknown }>;
  gets: Array<{ url: string; params: Record<string, unknown> | undefined }>;
  deletes: Array<{ url: string; data: unknown }>;
};

/**
 * Hand-rolled `SyncLogHttpClient` fake that records calls and returns canned
 * responses. Keeps a tiny in-memory "table" so the adapter's read-modify-write on
 * `entries` is observable end-to-end.
 */
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
      const row = data as { id: string };
      rows.set(row.id, { id: row.id, entries: '[]', started_at: new Date().toISOString() });
      return { data: { data: { id: row.id } } };
    },
    async patch(url, data) {
      calls.patches.push({ url, data });
      // Mirror Directus: PATCH /items/{collection}/{id} → updates that single row.
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
      // GET single row → mirror Directus: `data: { data: row }` (object, not array).
      const matchSingle = /\/items\/[^/]+\/(.+)$/.exec(url);
      if (matchSingle) {
        const id = matchSingle[1]!;
        const row = rows.get(id);
        return { data: { data: row ?? null } };
      }
      // GET list — sorted descending by started_at.
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

describe('createSyncLogWriter', () => {
  it('startSession POSTs an in_progress row with the supplied metadata and returns the id', async () => {
    let counter = 0;
    const generateId = () => `session-${++counter}`;
    const { api, calls } = makeFakeApi();
    const writer = createSyncLogWriter({ api, collectionName: 'localazy_sync_log', generateId });

    const id = await writer.startSession({
      eventType: 'download-incremental',
      initiator: 'user-id-7',
      initiatorUser: 'user-id-7',
    });

    expect(id).toBe('session-1');
    expect(calls.posts).toHaveLength(1);
    const posted = calls.posts[0]!.data as Record<string, unknown>;
    expect(posted.id).toBe('session-1');
    expect(posted.event_type).toBe('download-incremental');
    expect(posted.status).toBe('in_progress');
    expect(posted.initiator).toBe('user-id-7');
    expect(posted.initiator_user).toBe('user-id-7');
    expect(posted.entries).toBe('[]');
  });

  it('appendEntry reads, parses, pushes, and PATCHes the entries array', async () => {
    let counter = 0;
    const { api, rows } = makeFakeApi();
    const writer = createSyncLogWriter({ api, collectionName: 'localazy_sync_log', generateId: () => `s-${++counter}` });

    const id = await writer.startSession({ eventType: 'download-incremental', initiator: 'u', initiatorUser: 'u' });
    await writer.appendEntry(id, { timestamp: '2026-05-12T12:00:00Z', level: 'info', message: 'one' });
    await writer.appendEntry(id, { timestamp: '2026-05-12T12:00:01Z', level: 'info', message: 'two' });

    const stored = JSON.parse(rows.get(id)!.entries) as SyncLogEntry[];
    expect(stored).toHaveLength(2);
    expect(stored[0]!.message).toBe('one');
    expect(stored[1]!.message).toBe('two');
  });

  it('finish PATCHes the terminal fields and triggers a retention trim', async () => {
    let counter = 0;
    // Seed 105 rows so the trim has something to do — but the writer's GET is sorted
    // by started_at desc, so seed each with a distinct timestamp.
    const seeded: Array<{ id: string; entries: string; started_at: string }> = [];
    for (let i = 0; i < 105; i += 1) {
      seeded.push({
        id: `seed-${i.toString().padStart(3, '0')}`,
        entries: '[]',
        started_at: new Date(2026, 0, 1, 0, 0, i).toISOString(), // newer i → later timestamp
      });
    }
    const { api, calls, rows } = makeFakeApi(seeded);
    const writer = createSyncLogWriter({ api, collectionName: 'localazy_sync_log', generateId: () => `new-${++counter}` });

    // Add one more row (the current run) — the trim should remove the 6 oldest so the
    // table lands at 100 rows after finish.
    await writer.startSession({ eventType: 'download-full', initiator: 'u', initiatorUser: 'u' });
    await writer.finish('new-1', { status: 'completed', summary: 'done', itemsProcessed: 42 });

    // The trim DELETE removed the 6 oldest started_at rows (seed-000..seed-005).
    expect(calls.deletes).toHaveLength(1);
    const deletedIds = calls.deletes[0]!.data as string[];
    expect(deletedIds).toHaveLength(6);
    deletedIds.forEach((id) => expect(rows.has(id)).toBe(false));
    // The PATCH for the terminal fields landed.
    const finishPatch = calls.patches.find((c) => c.url.endsWith('/new-1'));
    expect(finishPatch).toBeTruthy();
    const patch = finishPatch!.data as Record<string, unknown>;
    expect(patch.status).toBe('completed');
    expect(patch.summary).toBe('done');
    expect(patch.items_processed).toBe(42);
  });

  it('appendEntry swallows PATCH errors so a single slow write does not break the chain', async () => {
    const { api } = makeFakeApi();
    let failNext = true;
    const originalPatch = api.patch.bind(api);
    api.patch = async (url, data) => {
      if (failNext) {
        failNext = false;
        throw new Error('simulated transient failure');
      }
      return originalPatch(url, data);
    };
    const writer = createSyncLogWriter({ api, collectionName: 'localazy_sync_log', generateId: () => 'sx' });
    await writer.startSession({ eventType: 'download-incremental', initiator: 'u', initiatorUser: 'u' });
    // Should not throw — the writer swallows the failure.
    await expect(writer.appendEntry('sx', { timestamp: 'now', level: 'info', message: 'lost' })).resolves.toBeUndefined();
    // The next append still works.
    await expect(writer.appendEntry('sx', { timestamp: 'later', level: 'info', message: 'kept' })).resolves.toBeUndefined();
  });

  it('serializes concurrent appendEntry calls on the same session (no lost entries)', async () => {
    // Simulate a slow GET so two appends can overlap. Without serialization the second
    // PATCH would clobber the first's append because both reads see the same `stored`
    // before either PATCH lands.
    let stored = '[]';
    let getCallCount = 0;
    const api: Partial<SyncLogHttpClient> = {
      async post() {
        return { data: { data: { id: 'sess-1' } } };
      },
      async get() {
        getCallCount += 1;
        // Delay the first GET so the second appendEntry overlaps it.
        if (getCallCount === 1) await new Promise((r) => setTimeout(r, 10));
        return { data: { data: { entries: stored } } };
      },
      async patch(_url, body) {
        const patch = body as { entries?: string };
        if (typeof patch.entries === 'string') stored = patch.entries;
        return { data: { data: {} } };
      },
      async delete() {
        return { data: {} };
      },
    };
    const writer = createSyncLogWriter({ api: api as SyncLogHttpClient, collectionName: 'localazy_sync_log' });
    const id = await writer.startSession({ eventType: 'download-incremental', initiator: 'u-1', initiatorUser: 'u-1' });
    // Two concurrent appends. The first is fire-and-forget; the second is awaited.
    void writer.appendEntry(id, { timestamp: '2026-05-13T00:00:00Z', level: 'info', message: 'first' });
    await writer.appendEntry(id, { timestamp: '2026-05-13T00:00:01Z', level: 'info', message: 'second' });
    // Wait for any tail microtasks from the fire-and-forget cleanup chain.
    await new Promise((r) => setTimeout(r, 30));
    const parsed = JSON.parse(stored) as SyncLogEntry[];
    expect(parsed).toHaveLength(2);
    expect(parsed.map((e) => e.message)).toEqual(['first', 'second']);
  });

  it('finish trim failure does not propagate', async () => {
    const { api } = makeFakeApi();
    api.delete = async () => {
      throw new Error('trim failed');
    };
    const writer = createSyncLogWriter({ api, collectionName: 'localazy_sync_log', generateId: () => 'sy' });
    await writer.startSession({ eventType: 'download-incremental', initiator: 'u', initiatorUser: 'u' });
    // Force the list to be > 100 by mocking get so trim is attempted.
    let getCount = 0;
    const originalGet = api.get.bind(api);
    api.get = async (url, cfg) => {
      getCount += 1;
      if (getCount > 1) {
        // List call inside trim — return 105 ids.
        return {
          data: {
            data: Array.from({ length: 105 }, (_, i) => ({ id: `id-${i}` })),
          },
        };
      }
      return originalGet(url, cfg);
    };
    await expect(writer.finish('sy', { status: 'completed', summary: 'ok', itemsProcessed: 1 })).resolves.toBeUndefined();
  });
});
