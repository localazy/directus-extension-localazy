import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Project } from '@localazy/api-client';
import { buildServerOrchestratorAdapters, WebhookDirectusApi } from './orchestrator-adapters';
import type { DirectusLogger, ItemsServiceCtor } from '../hook/types/directus-services';

type FakeRow = Record<string, unknown>;

/**
 * Single targeted cast: the FakeService class structurally matches Directus' generic
 * `ItemsServiceCtor` (the only contractual surface we exercise) but TS rejects the
 * comparison because Directus' signature is keyed on `Item` (not `Record<string,
 * unknown>`) and accepts an optional `accountability`. Funneling every test's pass to
 * this helper keeps the cast count to one.
 */
function asItemsServiceCtor(ctor: unknown): ItemsServiceCtor {
  return ctor as ItemsServiceCtor;
}

/**
 * Pino's `Logger` (which `DirectusLogger` aliases) declares ~20 members; the adapters
 * only call `info` / `warn` / `error`. A direct `as DirectusLogger` cast fails the
 * structural compatibility check, and re-declaring the full Pino surface in tests
 * brings no value. The boundary-cast through `unknown` is contained to this helper —
 * one place, no spread of casts.
 */
function asDirectusLogger(logger: unknown): DirectusLogger {
  return logger as DirectusLogger;
}

/**
 * Minimal in-memory `ItemsService` fake the adapter tests run against. Surfaces a
 * constructor-call spy so tests can assert that adapters use the expected accountability
 * (`null` for lock/cursor/sync_log, the webhook user's accountability for translation
 * writes).
 */
function makeFakeItemsService(initial: Record<string, FakeRow[]>) {
  const tables = new Map<string, FakeRow[]>();
  for (const [k, v] of Object.entries(initial)) tables.set(k, [...v]);

  const ctorCalls: Array<{ collection: string; options: { accountability: unknown } }> = [];

  class FakeService<T extends FakeRow = FakeRow> {
    private collection: string;
    constructor(collection: string, options: { accountability: unknown }) {
      this.collection = collection;
      ctorCalls.push({ collection, options });
    }
    async readByQuery(q: { sort?: string[] } = {}): Promise<T[]> {
      const list = ((tables.get(this.collection) ?? []) as T[]).slice();
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
    async upsertSingleton(data: Partial<T>) {
      const list = tables.get(this.collection) ?? [];
      if (list.length === 0) list.push({ id: 1, ...data });
      else list[0] = { ...list[0], ...data };
      tables.set(this.collection, list);
      return 1;
    }
    async upsertOne(data: Partial<T>) {
      const list = tables.get(this.collection) ?? [];
      const id = data.id as string | undefined;
      if (id) {
        const idx = list.findIndex((r) => r.id === id);
        if (idx >= 0) list[idx] = { ...list[idx], ...data };
        else list.push(data as FakeRow);
      } else {
        list.push(data as FakeRow);
      }
      tables.set(this.collection, list);
      return data.id as string;
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

function makeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  };
}

/**
 * Build a `Project`-shaped fixture. `@localazy/api-client`'s `Project` carries many
 * required fields (`slug`, `image`, `url`, `description`, `type`, `tone`, `role`,
 * `organization`) the adapters don't read at all. Filling those with placeholders here
 * avoids the `as unknown as Project` double-cast escape hatch.
 */
function buildProjectFixture(): Project {
  return {
    id: 'proj-1',
    orgId: 'org-1',
    name: 'test',
    slug: 'test',
    image: '',
    url: '',
    description: '',
    type: 'public',
    tone: 'not_specified',
    role: 'owner',
    sourceLanguage: 1,
    organization: {} as Project['organization'],
    languages: [],
  };
}

const project: Project = buildProjectFixture();

describe('CursorStore adapter', () => {
  let fake: ReturnType<typeof makeFakeItemsService>;
  let logger: ReturnType<typeof makeLogger>;

  beforeEach(() => {
    fake = makeFakeItemsService({
      localazy_sync_state: [{ id: 1, processed_keys: '{"en":{"k1":5}}', cursor_project_id: 'proj-1' }],
    });
    logger = makeLogger();
  });

  it('load() returns the parsed cursor + stored project id', async () => {
    const adapters = buildServerOrchestratorAdapters({
      ItemsService: asItemsServiceCtor(fake.FakeService),
      schema: { collections: {}, relations: [] },
      logger: asDirectusLogger(logger),
      writeAccountability: null,
      localazyProject: project,
    });

    const result = await adapters.cursorStore.load();

    expect(result.projectId).toBe('proj-1');
    expect(result.cursor.processed_keys.en?.k1).toBe(5);
  });

  it('persist() merges with on-disk cursor via max(event) and writes the project id', async () => {
    const adapters = buildServerOrchestratorAdapters({
      ItemsService: asItemsServiceCtor(fake.FakeService),
      schema: { collections: {}, relations: [] },
      logger: asDirectusLogger(logger),
      writeAccountability: null,
      localazyProject: project,
    });

    await adapters.cursorStore.persist({ processed_keys: { en: { k2: 7 }, de: { k1: 3 } } });

    const row = fake.tables.get('localazy_sync_state')?.[0];
    const persisted = JSON.parse(row?.processed_keys as string);
    // Merge: on-disk en.k1=5 preserved, in-memory en.k2=7 added, de.k1=3 added.
    expect(persisted.en).toEqual({ k1: 5, k2: 7 });
    expect(persisted.de).toEqual({ k1: 3 });
    expect(row?.cursor_project_id).toBe('proj-1');
  });

  it('persist() swallows errors and logs a warning', async () => {
    // Force the write path to throw — table doesn't exist.
    const broken = makeFakeItemsService({});
    const FakeServiceBroken = class extends broken.FakeService {
      async upsertSingleton(): Promise<number> {
        throw new Error('boom');
      }
    };
    const adapters = buildServerOrchestratorAdapters({
      ItemsService: asItemsServiceCtor(FakeServiceBroken),
      schema: { collections: {}, relations: [] },
      logger: asDirectusLogger(logger),
      writeAccountability: null,
      localazyProject: project,
    });

    await expect(adapters.cursorStore.persist({ processed_keys: {} })).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });
});

describe('LockStore adapter', () => {
  let fake: ReturnType<typeof makeFakeItemsService>;
  let logger: ReturnType<typeof makeLogger>;

  beforeEach(() => {
    fake = makeFakeItemsService({
      localazy_sync_state: [{ id: 1, sync_in_progress: false, acquired_token: '' }],
    });
    logger = makeLogger();
  });

  function buildLock() {
    return buildServerOrchestratorAdapters({
      ItemsService: asItemsServiceCtor(fake.FakeService),
      schema: { collections: {}, relations: [] },
      logger: asDirectusLogger(logger),
      writeAccountability: null,
      localazyProject: project,
    }).lockStore;
  }

  it('read() projects the persisted row onto the LockState shape', async () => {
    fake.tables.set('localazy_sync_state', [
      {
        id: 1,
        sync_in_progress: true,
        sync_started_at: '2025-01-01T00:00:00Z',
        sync_initiator: 'webhook',
        sync_pending: false,
        sync_items_processed: 42,
        sync_last_heartbeat_at: '2025-01-01T00:00:30Z',
        acquired_token: 'tok-1',
      },
    ]);
    const lock = buildLock();
    const state = await lock.read();
    expect(state).toEqual({
      in_progress: true,
      started_at: '2025-01-01T00:00:00Z',
      initiator: 'webhook',
      pending: false,
      items_processed: 42,
      last_heartbeat_at: '2025-01-01T00:00:30Z',
      acquired_token: 'tok-1',
    });
  });

  it('acquire() writes the token + zeroed counters and returns the token on verify-success', async () => {
    const lock = buildLock();
    const got = await lock.acquire('webhook', 'tok-A');
    expect(got).toBe('tok-A');
    const row = fake.tables.get('localazy_sync_state')?.[0];
    expect(row?.acquired_token).toBe('tok-A');
    expect(row?.sync_in_progress).toBe(true);
    expect(row?.sync_items_processed).toBe(0);
    expect(row?.sync_initiator).toBe('webhook');
  });

  it('heartbeat() no-ops when the token no longer matches', async () => {
    const lock = buildLock();
    await lock.acquire('webhook', 'tok-A');
    // A different initiator steals the lock.
    await lock.acquire('ui-incremental', 'tok-B');
    // Original holder's heartbeat must NOT update the row.
    await lock.heartbeat('tok-A', 99);
    const row = fake.tables.get('localazy_sync_state')?.[0];
    expect(row?.acquired_token).toBe('tok-B'); // still the new holder
    expect(row?.sync_items_processed).toBe(0); // not updated by old holder
  });

  it('release() returns wasPending=true when the dirty bit was set', async () => {
    const lock = buildLock();
    await lock.acquire('webhook', 'tok-A');
    await lock.markPending();
    const out = await lock.release('tok-A');
    expect(out.wasPending).toBe(true);
    const row = fake.tables.get('localazy_sync_state')?.[0];
    expect(row?.acquired_token).toBe('');
    expect(row?.sync_in_progress).toBe(false);
  });

  it('release() returns wasPending=false when the token no longer matches', async () => {
    const lock = buildLock();
    await lock.acquire('webhook', 'tok-A');
    await lock.acquire('ui-incremental', 'tok-B');
    const out = await lock.release('tok-A');
    expect(out.wasPending).toBe(false);
    // The new holder's state must remain intact.
    const row = fake.tables.get('localazy_sync_state')?.[0];
    expect(row?.acquired_token).toBe('tok-B');
  });

  it('markPending() sets the dirty bit', async () => {
    const lock = buildLock();
    await lock.acquire('webhook', 'tok-A');
    await lock.markPending();
    const row = fake.tables.get('localazy_sync_state')?.[0];
    expect(row?.sync_pending).toBe(true);
  });
});

describe('SyncLogWriter adapter', () => {
  let fake: ReturnType<typeof makeFakeItemsService>;
  let logger: ReturnType<typeof makeLogger>;

  beforeEach(() => {
    fake = makeFakeItemsService({ localazy_sync_log: [] });
    logger = makeLogger();
  });

  function buildWriter() {
    return buildServerOrchestratorAdapters({
      ItemsService: asItemsServiceCtor(fake.FakeService),
      schema: { collections: {}, relations: [] },
      logger: asDirectusLogger(logger),
      writeAccountability: null,
      localazyProject: project,
    }).syncLogWriter;
  }

  it('startSession() creates a row with status=in_progress and returns the new id', async () => {
    const writer = buildWriter();
    const id = await writer.startSession({ eventType: 'download-incremental', initiator: 'webhook', initiatorUser: null });
    const rows = fake.tables.get('localazy_sync_log') ?? [];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(id);
    expect(rows[0]?.status).toBe('in_progress');
    expect(rows[0]?.event_type).toBe('download-incremental');
    expect(rows[0]?.entries).toBe('[]');
  });

  it('appendEntry() reads, mutates and writes the entries column', async () => {
    const writer = buildWriter();
    const id = await writer.startSession({ eventType: 'webhook', initiator: 'webhook', initiatorUser: null });
    await writer.appendEntry(id, { timestamp: 't1', level: 'info', message: 'first' });
    await writer.appendEntry(id, { timestamp: 't2', level: 'info', message: 'second' });
    const rows = fake.tables.get('localazy_sync_log') ?? [];
    const parsed = JSON.parse((rows[0]?.entries ?? '[]') as string);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].message).toBe('first');
    expect(parsed[1].message).toBe('second');
  });

  it('per-session promise chain serializes concurrent appends', async () => {
    // The whole point of the chain — fire two appends "simultaneously", neither should
    // clobber the other's read-modify-write cycle.
    const writer = buildWriter();
    const id = await writer.startSession({ eventType: 'webhook', initiator: 'webhook', initiatorUser: null });
    await Promise.all([
      writer.appendEntry(id, { timestamp: 't1', level: 'info', message: 'one' }),
      writer.appendEntry(id, { timestamp: 't2', level: 'info', message: 'two' }),
      writer.appendEntry(id, { timestamp: 't3', level: 'info', message: 'three' }),
    ]);
    const rows = fake.tables.get('localazy_sync_log') ?? [];
    const parsed = JSON.parse((rows[0]?.entries ?? '[]') as string);
    expect(parsed).toHaveLength(3);
    expect(parsed.map((e: { message: string }) => e.message)).toEqual(['one', 'two', 'three']);
  });

  it('finish() patches terminal fields and trims past SYNC_LOG_RETENTION rows', async () => {
    // Seed 102 rows so the trim logic kicks in. The trim is best-effort and runs after
    // the patch — we assert both.
    const seed = Array.from({ length: 102 }, (_, i) => ({
      id: `s-${i}`,
      status: 'completed',
      event_type: 'webhook',
      entries: '[]',
      started_at: new Date(2000, 0, 1 + i).toISOString(),
    }));
    fake.tables.set('localazy_sync_log', seed);
    const writer = buildWriter();
    const newId = await writer.startSession({ eventType: 'webhook', initiator: 'webhook', initiatorUser: null });
    await writer.finish(newId, { status: 'completed', summary: 'done', itemsProcessed: 5 });
    const rows = fake.tables.get('localazy_sync_log') ?? [];
    // The new row + the 102 seeded = 103, trimmed back down to 100 retained — actual
    // count depends on `started_at` ordering inside the fake; we mainly verify the
    // status patch landed and the table shrank.
    const finishedRow = rows.find((r) => r.id === newId);
    expect(finishedRow?.status).toBe('completed');
    expect(finishedRow?.summary).toBe('done');
    expect(finishedRow?.items_processed).toBe(5);
    expect(rows.length).toBeLessThanOrEqual(100);
  });
});

describe('WebhookDirectusApi accountability propagation', () => {
  it('forwards the configured accountability to ItemsService for write paths', async () => {
    const fake = makeFakeItemsService({ posts: [{ id: 1 }] });
    const writeAccountability = { user: 'u', role: 'r', roles: ['r'], admin: true, app: true, ip: null };
    const api = new WebhookDirectusApi(asItemsServiceCtor(fake.FakeService), { collections: {}, relations: [] }, writeAccountability);

    await api.updateDirectusItem('posts', 1, { id: 1, foo: 'bar' });

    const writeCall = fake.ctorCalls.find((c) => c.collection === 'posts');
    expect(writeCall?.options.accountability).toEqual(writeAccountability);
  });
});
