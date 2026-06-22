import { describe, expect, it, vi } from 'vitest';
import type { Item, Query } from '@directus/types';
import type { Key, Project } from '@localazy/api-client';
import { runIncrementalImport, ImportProgressIds } from './incremental-import-orchestrator';
import { UpsertProgressIds } from './upsert-localazy-content';
import {
  CursorStore,
  ErrorSink,
  FetchLocalazyContentInput,
  LocalazyContentFetcher,
  LockState,
  LockStore,
  OrchestratorAdapters,
  ProgressSink,
  ResolveLanguageFkField,
  SyncLogWriter,
} from './ports';
import { SyncLogEntry } from '../../models/collections-data/sync-log';
import { SYNC_LOCK_HARD_CEILING_MS, SYNC_LOCK_HEARTBEAT_MS, SYNC_LOCK_STALE_HEARTBEAT_MS } from './lock-constants';
import { DirectusApi, ItemOptions } from '../../interfaces/directus-api';
import { DirectusApiResultTranslationString } from '../../models/translation-string';
import { LocalazyCollectionBlock, LocalazyContent, LocalazyItemsInLanguage } from '../../models/localazy-content';
import { Settings } from '../../models/collections-data/settings';
import { LocalazyData } from '../../models/collections-data/localazy-data';
import { CreateMissingLanguagesInDirectus } from '../../enums/create-missing-languages-in-directus';
import { SyncCursor } from '../../models/collections-data/sync-state';
import { mergeCursor, parseCursor, serializeCursor } from '../../utilities/sync-cursor';

/* -------------------------------------------------------------------------- */
/*  Test fakes — in-memory adapters that mirror real-world behaviour just     */
/*  closely enough for the orchestrator's contract to be observable.          */
/* -------------------------------------------------------------------------- */

/**
 * In-memory `CursorStore`. Mirrors the production merge-on-persist contract — `persist`
 * merges via `max(event)` against the stored snapshot, exactly like the Pinia adapter.
 */
function makeInMemoryCursorStore(initial: { cursor: SyncCursor; projectId: string } = { cursor: { processed_keys: {} }, projectId: '' }) {
  let diskCursor = serializeCursor(initial.cursor);
  let diskProjectId = initial.projectId;
  const persistCalls: SyncCursor[] = [];

  const store: CursorStore = {
    async load() {
      return { cursor: parseCursor(diskCursor), projectId: diskProjectId };
    },
    async persist(inMemory) {
      persistCalls.push(JSON.parse(JSON.stringify(inMemory)) as SyncCursor);
      const onDisk = parseCursor(diskCursor);
      const merged = mergeCursor(onDisk, inMemory);
      diskCursor = serializeCursor(merged);
    },
  };

  return {
    store,
    get persistCalls() {
      return persistCalls;
    },
    get diskCursor() {
      return parseCursor(diskCursor);
    },
    setProjectId(id: string) {
      diskProjectId = id;
    },
  };
}

/**
 * Fake content fetcher that returns a fixed `LocalazyContent` payload — bypasses the real
 * Localazy API. Records each call so tests can assert on filter / language wiring.
 */
function makeContentFetcher(content: LocalazyContent | 'failure'): {
  fetcher: LocalazyContentFetcher;
  calls: FetchLocalazyContentInput[];
} {
  const calls: FetchLocalazyContentInput[] = [];
  return {
    calls,
    fetcher: {
      async fetchContent(input) {
        calls.push(input);
        if (content === 'failure') {
          return { success: false };
        }
        return { success: true, content };
      },
    },
  };
}

type DirectusApiFakeOpts = {
  /** Per-collection rows returned by `fetchDirectusItems`. */
  itemsByCollection?: Record<string, Item[]>;
  /** When set, `updateDirectusItem` throws once for the matching `(collection, itemId)`. */
  failNextUpdateOn?: { collection: string; itemId: string | number };
};

function makeDirectusApi(opts: DirectusApiFakeOpts = {}) {
  const updateCalls: Array<{ collection: string; itemId: string | number; data: Item }> = [];
  const itemsByCollection = opts.itemsByCollection ?? {};
  let failOnce = opts.failNextUpdateOn ?? null;

  const api: DirectusApi = {
    async fetchDirectusItems<T extends Item>(collection: string, _query?: Query): Promise<T[]> {
      return (itemsByCollection[collection] ?? []) as T[];
    },
    async createDirectusItem(): Promise<void> {
      // Not exercised by the import orchestrator.
    },
    async updateDirectusItem<T extends Item>(collection: string, itemId: number | string, data: T, _options?: ItemOptions): Promise<void> {
      if (failOnce && failOnce.collection === collection && failOnce.itemId === itemId) {
        failOnce = null;
        throw new Error('Simulated Directus PATCH failure');
      }
      updateCalls.push({ collection, itemId, data });
    },
    getCollection() {
      return null;
    },
    async fetchSettings() {
      return null;
    },
    async fetchTranslationStrings(): Promise<DirectusApiResultTranslationString[]> {
      return [];
    },
    async upsertTranslationString(): Promise<void> {
      // Not exercised by the collections-only happy-path tests.
    },
    async updateSettings(): Promise<void> {},
  };

  return { api, updateCalls };
}

/** Plain progress sink — records every call so tests can introspect the message flow. */
function makeProgressSink() {
  const messages: Array<Parameters<ProgressSink>[0]> = [];
  const sink: ProgressSink = (m) => {
    messages.push(m);
  };
  return { sink, messages };
}

const resolveLanguageFkFieldDefault: ResolveLanguageFkField = () => 'languages_code';

/**
 * In-memory `LockStore` with CAS semantics that match the production Pinia adapter.
 * `acquire` writes the new token plus zeroed counters, then re-reads — if a concurrent
 * `acquire` clobbered the token, returns null. `heartbeat` / `release` are token-gated.
 *
 * Tests can inject state via `mutate(...)` / `set(...)` to simulate prior runs, or
 * `setBeforeVerifyReadHook(...)` to inject a concurrent write between acquire's write
 * and verify-read (used by the CAS race-loss test).
 */
function makeInMemoryLockStore(initial: Partial<LockState> = {}) {
  let state: LockState = {
    in_progress: false,
    started_at: null,
    initiator: '',
    pending: false,
    items_processed: 0,
    last_heartbeat_at: null,
    acquired_token: '',
    ...initial,
  };
  const acquireCalls: Array<{ initiator: string; token: string }> = [];
  const heartbeatCalls: Array<{ token: string; itemsProcessed: number; at: number }> = [];
  const releaseCalls: Array<{ token: string }> = [];
  const markPendingCalls: number[] = [];
  /**
   * Pluggable hook fired during `acquire` between the write and the verify re-read.
   * Used by the CAS race test to inject another contender's write at exactly the wrong
   * moment.
   */
  let beforeVerifyReadHook: (() => Promise<void> | void) | null = null;

  const store: LockStore = {
    async read() {
      return { ...state };
    },
    async acquire(initiator, token) {
      acquireCalls.push({ initiator, token });
      // Mirrors production: `pending` is intentionally NOT overwritten on acquire.
      // A contender's `markPending()` set before our acquire (e.g. after the prior
      // run's release-clear but before our token landed) must survive — release
      // then re-fires once. Stomping the bit here would silently drop the contender's
      // "please re-fire me" signal.
      state = {
        ...state,
        in_progress: true,
        started_at: new Date().toISOString(),
        initiator,
        items_processed: 0,
        last_heartbeat_at: null,
        acquired_token: token,
      };
      if (beforeVerifyReadHook) {
        await beforeVerifyReadHook();
      }
      return state.acquired_token === token ? token : null;
    },
    async heartbeat(token, itemsProcessed) {
      heartbeatCalls.push({ token, itemsProcessed, at: Date.now() });
      if (state.acquired_token !== token) return;
      state = {
        ...state,
        last_heartbeat_at: new Date().toISOString(),
        items_processed: itemsProcessed,
      };
    },
    async release(token) {
      releaseCalls.push({ token });
      if (state.acquired_token !== token) return { wasPending: false };
      const wasPending = state.pending;
      state = {
        in_progress: false,
        started_at: null,
        initiator: '',
        pending: false,
        items_processed: 0,
        last_heartbeat_at: null,
        acquired_token: '',
      };
      return { wasPending };
    },
    async markPending() {
      markPendingCalls.push(Date.now());
      state = { ...state, pending: true };
    },
  };

  return {
    store,
    get state() {
      return state;
    },
    get acquireCalls() {
      return acquireCalls;
    },
    get heartbeatCalls() {
      return heartbeatCalls;
    },
    get releaseCalls() {
      return releaseCalls;
    },
    get markPendingCalls() {
      return markPendingCalls;
    },
    set(next: Partial<LockState>) {
      state = { ...state, ...next };
    },
    mutate(fn: (s: LockState) => LockState) {
      state = fn(state);
    },
    setBeforeVerifyReadHook(hook: (() => Promise<void> | void) | null) {
      beforeVerifyReadHook = hook;
    },
  };
}

/**
 * Narrows the discriminated `IncrementalImportResult` to the "ran" branch (i.e. not
 * `skipped`). Keeps the existing tests' `result.itemsProcessed` / `result.summary`
 * access type-safe without sprinkling `if (result.status !== 'skipped')` everywhere.
 * Throws a plain `Error` when narrowing fails; Vitest reports it as a test failure
 * with the message.
 */
type RanResult = Extract<Awaited<ReturnType<typeof runIncrementalImport>>, { itemsProcessed: number }>;
function assertRan(result: Awaited<ReturnType<typeof runIncrementalImport>>): RanResult {
  if (result.status === 'skipped') {
    throw new Error(`expected a completed/aborted/up-to-date run, got skipped: ${result.reason}`);
  }
  return result;
}

function makeAdapters(overrides: Partial<OrchestratorAdapters>): OrchestratorAdapters {
  const { api } = makeDirectusApi();
  const { fetcher } = makeContentFetcher({ collections: new Map(), translationStrings: new Map() });
  const { store } = makeInMemoryCursorStore();
  const { store: lockStore } = makeInMemoryLockStore();
  const { sink } = makeProgressSink();
  const onDirectusError: ErrorSink = () => {};
  return {
    cursorStore: store,
    lockStore,
    localazyContentFetcher: fetcher,
    progress: sink,
    directusApi: api,
    resolveLanguageFkField: resolveLanguageFkFieldDefault,
    onDirectusError,
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/*  Content-building helpers — keep the orchestrator's actual semantics       */
/*  observable without hand-rolling a full LocalazyContent tree per test.     */
/* -------------------------------------------------------------------------- */

const k = (id: string, event?: number): Key => ({ id, key: ['posts', '1', 'translations', 'title'], value: 'val', event }) as Key;

function buildCollectionContent(collection: string, perLang: Array<{ language: string; itemId: string; event?: number }>): LocalazyContent {
  const block: LocalazyCollectionBlock = { translationFields: ['translations'], items: {} };
  perLang.forEach(({ language, itemId, event }) => {
    const itemKey = Number(itemId);
    const entry: LocalazyItemsInLanguage = {
      language,
      items: [
        {
          field: 'title',
          translationField: 'translations',
          value: 'Hello',
          localazyKey: { ...k(`${language}-${itemId}`, event), key: [collection, itemId, 'translations', 'title'] } as Key,
        },
      ],
    };
    const list = block.items[itemKey] ?? [];
    list.push(entry);
    block.items[itemKey] = list;
  });
  return {
    collections: new Map([[collection, block]]),
    translationStrings: new Map(),
  };
}

/* -------------------------------------------------------------------------- */
/*  Fixed params used across most tests — keep the noise out of each case.    */
/* -------------------------------------------------------------------------- */

const settings: Settings = {
  language_collection: 'languages',
  language_code_field: 'code',
  source_language: 'en-US',
  localazy_oauth_response: '',
  import_source_language: false,
  upload_existing_translations: false,
  automated_upload: false,
  automated_deprecation: false,
  skip_empty_strings: false,
  create_missing_languages_in_directus: CreateMissingLanguagesInDirectus.NO,
  language_mappings: '',
  activity_logs_sort: '{}',
  automated_import: false,
  automated_import_user: null,
  automated_import_languages: '[]',
};

const localazyProject = { id: 'PROJ-A', orgId: 'org-1' } as Project;

const localazyData: LocalazyData = {
  access_token: 'tok',
  user_id: 'u',
  user_name: 'User',
  project_id: 'PROJ-A',
  project_url: '',
  project_name: 'p',
  org_id: 'org-1',
};

const baseParams = {
  mode: 'incremental' as const,
  languages: [],
  enabledFields: [{ collection: 'posts', fields: ['title'] }],
  localazyData,
  localazyProject,
  settings,
};

/* -------------------------------------------------------------------------- */
/*                                  Tests                                     */
/* -------------------------------------------------------------------------- */

describe('runIncrementalImport — orchestrator', () => {
  it('happy path: persists the cursor with every successfully-applied (lang, keyId, event)', async () => {
    // 1 collection / 1 item / 3 languages — each language has one key, all with distinct events.
    const content = buildCollectionContent('posts', [
      { language: 'fr', itemId: '1', event: 10 },
      { language: 'de', itemId: '1', event: 20 },
      { language: 'es', itemId: '1', event: 30 },
    ]);
    const { fetcher, calls: fetchCalls } = makeContentFetcher(content);
    const { api: directusApi, updateCalls } = makeDirectusApi({
      itemsByCollection: { posts: [{ id: '1', translations: [] }] },
    });
    const cursor = makeInMemoryCursorStore();
    const { sink, messages } = makeProgressSink();

    const result = assertRan(
      await runIncrementalImport(
        makeAdapters({ localazyContentFetcher: fetcher, directusApi, cursorStore: cursor.store, progress: sink }),
        baseParams,
      ),
    );

    expect(result.status).toBe('completed');
    expect(result.itemsProcessed).toBe(3);
    expect(result.summary).toEqual({ changes: 3, items: 1, collections: 1, languages: 3 });

    // Fetch was called once with a filterKeysForLanguage function derived from the cursor.
    expect(fetchCalls).toHaveLength(1);
    expect(typeof fetchCalls[0]!.filterKeysForLanguage).toBe('function');

    // Exactly one PATCH per item (3 languages collapsed into one item).
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]!.collection).toBe('posts');

    // Cursor persisted at end as a per-language high-water mark (max event seen per language).
    expect(cursor.persistCalls.length).toBeGreaterThanOrEqual(1);
    const final = cursor.diskCursor.processed_keys;
    expect(final.fr).toBe(10);
    expect(final.de).toBe(20);
    expect(final.es).toBe(30);

    // Progress messages — FETCHING_TRANSLATIONS → CHANGES_SUMMARY → UPDATING_DIRECTUS_COLLECTION → IMPORT_FINISHED.
    const ids = messages.map((m) => m.id);
    expect(ids).toContain(ImportProgressIds.FETCHING_TRANSLATIONS);
    expect(ids).toContain(ImportProgressIds.CHANGES_SUMMARY);
    expect(ids).toContain(UpsertProgressIds.UPDATING_DIRECTUS_COLLECTION);
    expect(ids).toContain(ImportProgressIds.IMPORT_FINISHED);
    expect(ids).not.toContain(ImportProgressIds.UP_TO_DATE);
  });

  it('up-to-date path: zero changes still persists the cursor so last_sync_at gets touched', async () => {
    const empty: LocalazyContent = { collections: new Map(), translationStrings: new Map() };
    const { fetcher } = makeContentFetcher(empty);
    const { api: directusApi, updateCalls } = makeDirectusApi();
    const cursor = makeInMemoryCursorStore();
    const { sink, messages } = makeProgressSink();

    const result = assertRan(
      await runIncrementalImport(
        makeAdapters({ localazyContentFetcher: fetcher, directusApi, cursorStore: cursor.store, progress: sink }),
        baseParams,
      ),
    );

    expect(result.status).toBe('up-to-date');
    expect(result.itemsProcessed).toBe(0);
    expect(updateCalls).toHaveLength(0); // no Directus writes
    expect(cursor.persistCalls).toHaveLength(1); // last_sync_at touch
    expect(messages.map((m) => m.id)).toContain(ImportProgressIds.UP_TO_DATE);
    expect(messages.map((m) => m.id)).not.toContain(ImportProgressIds.IMPORT_FINISHED);
  });

  it('project-id invalidation: stored cursor with mismatched project id is treated as empty', async () => {
    // Pre-seed disk cursor with an old entry that, if used, would filter the incoming key
    // away. The orchestrator should ignore the stored cursor because the project id no
    // longer matches.
    const cursor = makeInMemoryCursorStore({
      cursor: { processed_keys: { fr: 999 } },
      projectId: 'PROJ-OLD',
    });
    const content = buildCollectionContent('posts', [{ language: 'fr', itemId: '1', event: 5 }]);

    const { fetcher, calls: fetchCalls } = makeContentFetcher(content);
    const { api: directusApi } = makeDirectusApi({
      itemsByCollection: { posts: [{ id: '1', translations: [] }] },
    });

    await runIncrementalImport(makeAdapters({ localazyContentFetcher: fetcher, directusApi, cursorStore: cursor.store }), baseParams);

    // The filter was invoked with an empty per-language cursor — verify by feeding a key
    // whose event is lower than the stored 999 and confirming it's still returned.
    const filterFn = fetchCalls[0]!.filterKeysForLanguage!;
    expect(filterFn('fr', [{ id: 'any', event: 1, key: ['k'], value: 'v' } as Key])).toHaveLength(1);
  });

  it('full-sync mode: starts from an empty cursor even when the disk cursor matches the current project', async () => {
    const cursor = makeInMemoryCursorStore({
      cursor: { processed_keys: { fr: 999 } },
      projectId: 'PROJ-A',
    });
    const content = buildCollectionContent('posts', [{ language: 'fr', itemId: '1', event: 5 }]);

    const { fetcher, calls: fetchCalls } = makeContentFetcher(content);
    const { api: directusApi } = makeDirectusApi({
      itemsByCollection: { posts: [{ id: '1', translations: [] }] },
    });

    await runIncrementalImport(makeAdapters({ localazyContentFetcher: fetcher, directusApi, cursorStore: cursor.store }), {
      ...baseParams,
      mode: 'full',
    });

    // Same evidence as the project-mismatch case: stored cursor ignored.
    const filterFn = fetchCalls[0]!.filterKeysForLanguage!;
    expect(filterFn('fr', [{ id: 'any', event: 1, key: ['k'], value: 'v' } as Key])).toHaveLength(1);
  });

  it('aborted fetch: bails without persisting, returns aborted status', async () => {
    const { fetcher } = makeContentFetcher('failure');
    const { api: directusApi, updateCalls } = makeDirectusApi();
    const cursor = makeInMemoryCursorStore();

    const result = assertRan(
      await runIncrementalImport(makeAdapters({ localazyContentFetcher: fetcher, directusApi, cursorStore: cursor.store }), baseParams),
    );

    expect(result.status).toBe('aborted');
    expect(result.summary).toBeUndefined();
    expect(updateCalls).toHaveLength(0);
    expect(cursor.persistCalls).toHaveLength(0); // no cursor touch when the fetch never succeeded
  });

  it('single end-of-run persist: many keys collapse into one per-language watermark', async () => {
    // 150 keys across 150 items, events 1..150. The watermark cursor persists exactly once
    // (in `finally` — no mid-run throttled flush, since the watermark can only be finalised
    // after all failures are known), and records a single number per language (the max event).
    const perLang: Array<{ language: string; itemId: string; event?: number }> = [];
    for (let i = 1; i <= 150; i += 1) {
      perLang.push({ language: 'fr', itemId: String(i), event: i });
    }
    const content = buildCollectionContent('posts', perLang);

    const itemsInPosts: Item[] = perLang.map((p) => ({ id: p.itemId, translations: [] }));
    const { fetcher } = makeContentFetcher(content);
    const { api: directusApi } = makeDirectusApi({ itemsByCollection: { posts: itemsInPosts } });
    const cursor = makeInMemoryCursorStore();

    const result = assertRan(
      await runIncrementalImport(makeAdapters({ localazyContentFetcher: fetcher, directusApi, cursorStore: cursor.store }), baseParams),
    );

    expect(result.status).toBe('completed');
    expect(result.itemsProcessed).toBe(150);
    // Exactly one persist (the final flush). No mid-run throttling.
    expect(cursor.persistCalls).toHaveLength(1);
    // The 150 keys collapse to a single per-language watermark = the max event.
    expect(cursor.diskCursor.processed_keys.fr).toBe(150);
  });

  it('error in upsert: the watermark is held below the failed event so it retries next run', async () => {
    // 3 items; fail the second PATCH (event 20). Succeeded events {10, 30}, failed {20}.
    // The failure-safe watermark advances only to 10 (just below the earliest failure), so
    // the next run re-fetches event > 10 — retrying the failed key 2 (and redundantly 3).
    const content = buildCollectionContent('posts', [
      { language: 'fr', itemId: '1', event: 10 },
      { language: 'fr', itemId: '2', event: 20 },
      { language: 'fr', itemId: '3', event: 30 },
    ]);
    const itemsInPosts: Item[] = [
      { id: '1', translations: [] },
      { id: '2', translations: [] },
      { id: '3', translations: [] },
    ];
    const { fetcher } = makeContentFetcher(content);
    // Fail the second PATCH; the upsert step catches the error and emits an error progress
    // message, but the orchestrator's `finally` still persists what was written.
    const { api: directusApi, updateCalls } = makeDirectusApi({
      itemsByCollection: { posts: itemsInPosts },
      failNextUpdateOn: { collection: 'posts', itemId: '2' },
    });
    const errors: unknown[] = [];
    const onDirectusError: ErrorSink = (e) => errors.push(e);
    const cursor = makeInMemoryCursorStore();

    const result = await runIncrementalImport(
      makeAdapters({ localazyContentFetcher: fetcher, directusApi, cursorStore: cursor.store, onDirectusError }),
      baseParams,
    );

    expect(result.status).toBe('completed');
    expect(errors).toHaveLength(1);
    // Items 1 and 3 succeeded → 2 PATCHes recorded in `updateCalls`.
    expect(updateCalls.map((c) => c.itemId).sort()).toEqual(['1', '3']);
    // Watermark held at 10 (just below the failed event 20) so key 2 is retried next run.
    expect(cursor.diskCursor.processed_keys.fr).toBe(10);
    // The final persist always runs in `finally`.
    expect(cursor.persistCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('fire-and-forget analytics: reportDownloadAnalytics is invoked on a completed run', async () => {
    let called = 0;
    const content = buildCollectionContent('posts', [{ language: 'fr', itemId: '1', event: 1 }]);
    const { fetcher } = makeContentFetcher(content);
    const { api: directusApi } = makeDirectusApi({ itemsByCollection: { posts: [{ id: '1', translations: [] }] } });
    const cursor = makeInMemoryCursorStore();

    await runIncrementalImport(
      makeAdapters({
        localazyContentFetcher: fetcher,
        directusApi,
        cursorStore: cursor.store,
        reportDownloadAnalytics: () => {
          called += 1;
        },
      }),
      baseParams,
    );

    expect(called).toBe(1);
  });

  it('analytics is NOT fired on the up-to-date short-circuit (mirrors prior behaviour)', async () => {
    let called = 0;
    const empty: LocalazyContent = { collections: new Map(), translationStrings: new Map() };
    const { fetcher } = makeContentFetcher(empty);
    const cursor = makeInMemoryCursorStore();

    await runIncrementalImport(
      makeAdapters({
        localazyContentFetcher: fetcher,
        cursorStore: cursor.store,
        reportDownloadAnalytics: () => {
          called += 1;
        },
      }),
      baseParams,
    );

    expect(called).toBe(0);
  });

  /* ------------------------------------------------------------------------ */
  /*  Advisory sync lock — PR C                                               */
  /* ------------------------------------------------------------------------ */

  describe('advisory sync lock', () => {
    /** Helper: build a stale-by-heartbeat lock snapshot, started a minute ago. */
    function staleByHeartbeat(): Partial<LockState> {
      const now = Date.now();
      return {
        in_progress: true,
        started_at: new Date(now - 60_000).toISOString(),
        initiator: 'ui-incremental',
        pending: false,
        items_processed: 0,
        last_heartbeat_at: new Date(now - SYNC_LOCK_STALE_HEARTBEAT_MS - 60_000).toISOString(),
        acquired_token: 'zombie-token',
      };
    }

    /** Helper: build a stale-by-ceiling lock snapshot — fresh heartbeat, started > 2 h ago. */
    function staleByCeiling(): Partial<LockState> {
      const now = Date.now();
      return {
        in_progress: true,
        started_at: new Date(now - SYNC_LOCK_HARD_CEILING_MS - 60_000).toISOString(),
        initiator: 'ui-incremental',
        pending: false,
        items_processed: 0,
        last_heartbeat_at: new Date(now - 5_000).toISOString(), // fresh
        acquired_token: 'zombie-token',
      };
    }

    /** Helper: build a live, non-stale lock snapshot. */
    function liveLock(): Partial<LockState> {
      const now = Date.now();
      return {
        in_progress: true,
        started_at: new Date(now - 10_000).toISOString(),
        initiator: 'ui-incremental',
        pending: false,
        items_processed: 0,
        last_heartbeat_at: new Date(now - 1_000).toISOString(),
        acquired_token: 'live-token',
      };
    }

    it('happy path: lock acquired and released, no re-fire when dirty bit stays clear', async () => {
      const content = buildCollectionContent('posts', [{ language: 'fr', itemId: '1', event: 5 }]);
      const { fetcher } = makeContentFetcher(content);
      const { api: directusApi } = makeDirectusApi({ itemsByCollection: { posts: [{ id: '1', translations: [] }] } });
      const cursor = makeInMemoryCursorStore();
      const lock = makeInMemoryLockStore();

      const result = assertRan(
        await runIncrementalImport(
          makeAdapters({ localazyContentFetcher: fetcher, directusApi, cursorStore: cursor.store, lockStore: lock.store }),
          baseParams,
        ),
      );

      expect(result.status).toBe('completed');
      expect(lock.acquireCalls).toHaveLength(1);
      expect(lock.releaseCalls).toHaveLength(1);
      expect(lock.markPendingCalls).toHaveLength(0);
      // Released: in_progress false, token cleared.
      expect(lock.state.in_progress).toBe(false);
      expect(lock.state.acquired_token).toBe('');
    });

    it('initiator label: defaults to ui-incremental / ui-full from the sync mode when not supplied', async () => {
      const lock = makeInMemoryLockStore();
      // Patch acquire to capture the initiator without running the rest.
      let capturedInitiator = '';
      const originalAcquire = lock.store.acquire;
      lock.store.acquire = async (initiator, token) => {
        capturedInitiator = initiator;
        return originalAcquire(initiator, token);
      };

      const empty: LocalazyContent = { collections: new Map(), translationStrings: new Map() };
      const { fetcher } = makeContentFetcher(empty);

      await runIncrementalImport(makeAdapters({ localazyContentFetcher: fetcher, lockStore: lock.store }), baseParams);
      expect(capturedInitiator).toBe('ui-incremental');

      capturedInitiator = '';
      await runIncrementalImport(makeAdapters({ localazyContentFetcher: fetcher, lockStore: lock.store }), {
        ...baseParams,
        mode: 'full',
      });
      expect(capturedInitiator).toBe('ui-full');
    });

    it('lock held + not stale: contender returns skipped/in_progress and sets the dirty bit', async () => {
      const lock = makeInMemoryLockStore(liveLock());
      const { fetcher } = makeContentFetcher({ collections: new Map(), translationStrings: new Map() });

      const result = await runIncrementalImport(makeAdapters({ localazyContentFetcher: fetcher, lockStore: lock.store }), baseParams);

      expect(result.status).toBe('skipped');
      if (result.status === 'skipped') expect(result.reason).toBe('in_progress');
      expect(lock.markPendingCalls).toHaveLength(1);
      // We did NOT touch the lock holder's state.
      expect(lock.state.acquired_token).toBe('live-token');
      expect(lock.acquireCalls).toHaveLength(0);
    });

    it('lock held + not stale: holding run sees the dirty bit on release and re-fires once', async () => {
      // Two pieces of content: the first contains 1 key, the second none — so the re-fire
      // takes the up-to-date short-circuit and returns immediately. That's the bound: the
      // re-fire happens, but it doesn't loop because no new content shows up.
      const content = buildCollectionContent('posts', [{ language: 'fr', itemId: '1', event: 1 }]);
      const empty: LocalazyContent = { collections: new Map(), translationStrings: new Map() };
      const responses: Array<LocalazyContent | 'failure'> = [content, empty];
      let callIndex = 0;
      const fetcher: LocalazyContentFetcher = {
        async fetchContent() {
          const next = responses[callIndex] ?? empty;
          callIndex += 1;
          return next === 'failure' ? { success: false } : { success: true, content: next };
        },
      };
      const { api: directusApi } = makeDirectusApi({ itemsByCollection: { posts: [{ id: '1', translations: [] }] } });
      const cursor = makeInMemoryCursorStore();
      const lock = makeInMemoryLockStore();

      // Simulate a contender marking pending while the first run is in flight by patching
      // the cursor persist to flip the dirty bit just before the upsert resolves. The
      // simplest path: monkey-patch `directusApi.updateDirectusItem` to mark pending mid-run.
      const originalUpdate = directusApi.updateDirectusItem.bind(directusApi);
      directusApi.updateDirectusItem = async (col, id, data) => {
        await lock.store.markPending();
        await originalUpdate(col, id, data);
      };

      await runIncrementalImport(
        makeAdapters({ localazyContentFetcher: fetcher, directusApi, cursorStore: cursor.store, lockStore: lock.store }),
        baseParams,
      );

      // Two acquire calls: the original run + the re-fire.
      expect(lock.acquireCalls).toHaveLength(2);
      // Two releases (one per acquire).
      expect(lock.releaseCalls).toHaveLength(2);
      // After the re-fire the dirty bit is clear again.
      expect(lock.state.pending).toBe(false);
      // The fetcher saw exactly 2 calls — first run + 1 bounded re-fire.
      expect(callIndex).toBe(2);
    });

    it('preserves a contender-set dirty bit through acquire (no stomp)', async () => {
      // Setup: prior run released cleanly, then a contender between then and our
      // acquire called `markPending()` and surrendered. The on-disk state therefore
      // has `pending: true` with no current holder. `acquire` must NOT overwrite
      // that bit — otherwise the contender's "please re-fire me" signal silently
      // drops, and the work they wanted picked up never gets picked up. This test
      // would have falsely passed before the production fix that stopped writing
      // `sync_pending: false` in the acquire payload.
      const lock = makeInMemoryLockStore({ in_progress: false, pending: true });
      const empty: LocalazyContent = { collections: new Map(), translationStrings: new Map() };
      const { fetcher } = makeContentFetcher(empty);

      await runIncrementalImport(makeAdapters({ localazyContentFetcher: fetcher, lockStore: lock.store }), baseParams);

      // Two acquires: the initial run + the re-fire triggered by the preserved bit.
      expect(lock.acquireCalls).toHaveLength(2);
      // After both releases, the bit is cleared.
      expect(lock.state.pending).toBe(false);
    });

    it('stale by heartbeat: contender takes over despite in_progress=true', async () => {
      const lock = makeInMemoryLockStore(staleByHeartbeat());
      const content = buildCollectionContent('posts', [{ language: 'fr', itemId: '1', event: 1 }]);
      const { fetcher } = makeContentFetcher(content);
      const { api: directusApi } = makeDirectusApi({ itemsByCollection: { posts: [{ id: '1', translations: [] }] } });
      const cursor = makeInMemoryCursorStore();

      const result = assertRan(
        await runIncrementalImport(
          makeAdapters({ localazyContentFetcher: fetcher, directusApi, cursorStore: cursor.store, lockStore: lock.store }),
          baseParams,
        ),
      );

      expect(result.status).toBe('completed');
      expect(lock.acquireCalls).toHaveLength(1);
      expect(lock.markPendingCalls).toHaveLength(0);
    });

    it('stale by hard ceiling: contender takes over even with a fresh heartbeat', async () => {
      const lock = makeInMemoryLockStore(staleByCeiling());
      const content = buildCollectionContent('posts', [{ language: 'fr', itemId: '1', event: 1 }]);
      const { fetcher } = makeContentFetcher(content);
      const { api: directusApi } = makeDirectusApi({ itemsByCollection: { posts: [{ id: '1', translations: [] }] } });
      const cursor = makeInMemoryCursorStore();

      const result = assertRan(
        await runIncrementalImport(
          makeAdapters({ localazyContentFetcher: fetcher, directusApi, cursorStore: cursor.store, lockStore: lock.store }),
          baseParams,
        ),
      );

      expect(result.status).toBe('completed');
      expect(lock.acquireCalls).toHaveLength(1);
    });

    it('CAS lost: a parallel acquire mid-flight returns skipped/race_lost and marks pending', async () => {
      const lock = makeInMemoryLockStore();
      // Inject a competing write between our acquire's write and the verify re-read.
      // Once consumed, clear the hook so the next acquire (the re-fire path, if any)
      // doesn't keep clobbering — only this single CAS lap should race.
      lock.setBeforeVerifyReadHook(() => {
        lock.mutate((s) => ({ ...s, acquired_token: 'other-contender' }));
        lock.setBeforeVerifyReadHook(null);
      });
      const empty: LocalazyContent = { collections: new Map(), translationStrings: new Map() };
      const { fetcher } = makeContentFetcher(empty);

      const result = await runIncrementalImport(makeAdapters({ localazyContentFetcher: fetcher, lockStore: lock.store }), baseParams);

      expect(result.status).toBe('skipped');
      if (result.status === 'skipped') expect(result.reason).toBe('race_lost');
      expect(lock.markPendingCalls).toHaveLength(1);
    });

    it('re-fire bound: a single recursive call from the release path — no infinite loop even with repeated dirty bits', async () => {
      // The re-fire's body short-circuits via up-to-date (empty content), but a third
      // contender could still set the dirty bit during the re-fire. We verify the
      // _structure_ — re-fires only happen via release-time recursion, one per release.
      const empty: LocalazyContent = { collections: new Map(), translationStrings: new Map() };
      const { fetcher } = makeContentFetcher(empty);
      const lock = makeInMemoryLockStore();

      // Mark pending after every acquire so each release fires another run. Bounded
      // because the cursor / empty fetch means each run is O(1). Cap at 5 acquires so
      // a real infinite loop would still produce a finite (if large) count to assert on
      // — but the orchestrator only calls itself recursively once per release, so we
      // expect exactly the acquires triggered by external markPending writes.
      let acquireCount = 0;
      const originalAcquire = lock.store.acquire;
      lock.store.acquire = async (initiator, token) => {
        const result = await originalAcquire(initiator, token);
        acquireCount += 1;
        // Mark pending immediately so the release will re-fire. Cap at 3 to bound the test.
        if (acquireCount < 3) {
          await lock.store.markPending();
        }
        return result;
      };

      await runIncrementalImport(makeAdapters({ localazyContentFetcher: fetcher, lockStore: lock.store }), baseParams);

      // Each release that sees pending fires exactly one re-run. With markPending fired
      // on the first 2 acquires, the chain is: acquire #1 (pending=true) → release re-fires
      // → acquire #2 (pending=true) → release re-fires → acquire #3 (pending=false) → done.
      expect(acquireCount).toBe(3);
      expect(lock.state.in_progress).toBe(false);
      expect(lock.state.pending).toBe(false);
    });

    it('heartbeat interval: ticks bump last_heartbeat_at + items_processed for the current holder', async () => {
      vi.useFakeTimers();
      try {
        // Gate the fetch on an external promise so the run stays pending while we
        // advance fake timers — without this, the import body resolves synchronously
        // (in-memory adapters) and the heartbeat interval gets cleared before any
        // tick fires.
        let releaseFetch: (() => void) | null = null;
        const fetchGate = new Promise<void>((resolve) => {
          releaseFetch = resolve;
        });
        const fetcher: LocalazyContentFetcher = {
          async fetchContent() {
            await fetchGate;
            return { success: true, content: { collections: new Map(), translationStrings: new Map() } };
          },
        };
        const cursor = makeInMemoryCursorStore();
        const lock = makeInMemoryLockStore();

        const runPromise = runIncrementalImport(
          makeAdapters({ localazyContentFetcher: fetcher, cursorStore: cursor.store, lockStore: lock.store }),
          baseParams,
        );

        // Tick past two heartbeat intervals while the fetch is still gated. Each tick
        // fires `lock.heartbeat(token, currentItemsProcessed)`.
        await vi.advanceTimersByTimeAsync(SYNC_LOCK_HEARTBEAT_MS + 10);
        expect(lock.heartbeatCalls.length).toBeGreaterThanOrEqual(1);
        await vi.advanceTimersByTimeAsync(SYNC_LOCK_HEARTBEAT_MS + 10);
        expect(lock.heartbeatCalls.length).toBeGreaterThanOrEqual(2);

        // Release the fetch and let the run finish.
        releaseFetch!();
        await vi.runAllTimersAsync();
        await runPromise;

        // last_heartbeat_at on disk was bumped by the most recent tick.
        expect(lock.heartbeatCalls.length).toBeGreaterThanOrEqual(2);
        // Items processed seen by heartbeat: 0 throughout (up-to-date path, no writes).
        lock.heartbeatCalls.forEach((c) => {
          expect(c.itemsProcessed).toBe(0);
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it('items-processed counter increments across onWritten batches', async () => {
      // 5 items, 1 key each → onWritten fires 5 times, currentItemsProcessed climbs.
      const content = buildCollectionContent('posts', [
        { language: 'fr', itemId: '1', event: 1 },
        { language: 'fr', itemId: '2', event: 2 },
        { language: 'fr', itemId: '3', event: 3 },
        { language: 'fr', itemId: '4', event: 4 },
        { language: 'fr', itemId: '5', event: 5 },
      ]);
      const { fetcher } = makeContentFetcher(content);
      const { api: directusApi } = makeDirectusApi({
        itemsByCollection: {
          posts: [
            { id: '1', translations: [] },
            { id: '2', translations: [] },
            { id: '3', translations: [] },
            { id: '4', translations: [] },
            { id: '5', translations: [] },
          ],
        },
      });
      const cursor = makeInMemoryCursorStore();
      const lock = makeInMemoryLockStore();
      // Patch heartbeat to capture every itemsProcessed value across the run, including
      // values reached via the in-flight `currentItemsProcessed` closure variable.
      const captured: number[] = [];
      const originalHeartbeat = lock.store.heartbeat;
      lock.store.heartbeat = async (token, n) => {
        captured.push(n);
        await originalHeartbeat(token, n);
      };

      // Manually call heartbeat after the run completes — the integration test for the
      // setInterval cadence is the previous test; here we want the counter contract.
      const result = assertRan(
        await runIncrementalImport(
          makeAdapters({ localazyContentFetcher: fetcher, directusApi, cursorStore: cursor.store, lockStore: lock.store }),
          baseParams,
        ),
      );

      expect(result.itemsProcessed).toBe(5);
    });
  });

  /* ------------------------------------------------------------------------ */
  /*  Sync-log writer — PR D                                                  */
  /* ------------------------------------------------------------------------ */

  describe('sync-log writer', () => {
    /**
     * In-memory `SyncLogWriter` that records every call and keeps the per-session
     * entry list. Mirrors the production adapter's contract without HTTP.
     */
    function makeInMemorySyncLogWriter() {
      const sessions = new Map<
        string,
        {
          eventType: string;
          initiator: string;
          initiatorUser: string | null;
          status: string | null;
          summary: string | null;
          itemsProcessed: number | null;
          entries: SyncLogEntry[];
          finished: boolean;
        }
      >();
      let nextId = 0;
      const writer: SyncLogWriter = {
        async startSession(params) {
          nextId += 1;
          const id = `log-${nextId}`;
          sessions.set(id, {
            eventType: params.eventType,
            initiator: params.initiator,
            initiatorUser: params.initiatorUser,
            status: null,
            summary: null,
            itemsProcessed: null,
            entries: [],
            finished: false,
          });
          return id;
        },
        async appendEntry(sessionId, entry) {
          const s = sessions.get(sessionId);
          if (!s) return;
          s.entries.push(entry);
        },
        async finish(sessionId, params) {
          const s = sessions.get(sessionId);
          if (!s) return;
          s.status = params.status;
          s.summary = params.summary;
          s.itemsProcessed = params.itemsProcessed;
          s.finished = true;
        },
      };
      return { writer, sessions };
    }

    it('happy path: emits started → fetched → per-collection → completed entries', async () => {
      const content = buildCollectionContent('posts', [
        { language: 'fr', itemId: '1', event: 10 },
        { language: 'de', itemId: '2', event: 20 },
      ]);
      const { fetcher } = makeContentFetcher(content);
      const { api: directusApi } = makeDirectusApi({
        itemsByCollection: {
          posts: [
            { id: '1', translations: [] },
            { id: '2', translations: [] },
          ],
        },
      });
      const cursor = makeInMemoryCursorStore();
      const lock = makeInMemoryLockStore();
      const { writer, sessions } = makeInMemorySyncLogWriter();

      const adapters: OrchestratorAdapters = {
        ...makeAdapters({ localazyContentFetcher: fetcher, directusApi, cursorStore: cursor.store, lockStore: lock.store }),
        syncLogWriter: writer,
        syncLogInitiator: { initiator: 'user-7', initiatorUser: 'user-7' },
      };

      await runIncrementalImport(adapters, baseParams);

      expect(sessions.size).toBe(1);
      const session = Array.from(sessions.values())[0]!;
      expect(session.eventType).toBe('download-incremental');
      expect(session.initiator).toBe('user-7');
      expect(session.initiatorUser).toBe('user-7');
      expect(session.status).toBe('completed');
      expect(session.finished).toBe(true);

      const messages = session.entries.map((e) => e.message);
      expect(messages.some((m) => m.startsWith('Incremental sync started'))).toBe(true);
      expect(messages.some((m) => m.startsWith('Fetched 2 keys from Localazy'))).toBe(true);
      expect(messages.some((m) => m.startsWith('posts: 2 items updated'))).toBe(true);
      expect(messages.some((m) => m.startsWith('Sync completed:'))).toBe(true);
    });

    it('full-sync mode is reflected in event_type and the started entry wording', async () => {
      const empty: LocalazyContent = { collections: new Map(), translationStrings: new Map() };
      const { fetcher } = makeContentFetcher(empty);
      const { writer, sessions } = makeInMemorySyncLogWriter();
      const adapters: OrchestratorAdapters = {
        ...makeAdapters({ localazyContentFetcher: fetcher }),
        syncLogWriter: writer,
        syncLogInitiator: { initiator: 'user-7', initiatorUser: 'user-7' },
      };
      await runIncrementalImport(adapters, { ...baseParams, mode: 'full' });
      const session = Array.from(sessions.values())[0]!;
      expect(session.eventType).toBe('download-full');
      expect(session.entries.some((e) => e.message.startsWith('Full sync started'))).toBe(true);
    });

    it('upsert error logs partial status and an error-level entry', async () => {
      const content = buildCollectionContent('posts', [
        { language: 'fr', itemId: '1', event: 10 },
        { language: 'fr', itemId: '2', event: 20 },
      ]);
      const { fetcher } = makeContentFetcher(content);
      const { api: directusApi } = makeDirectusApi({
        itemsByCollection: {
          posts: [
            { id: '1', translations: [] },
            { id: '2', translations: [] },
          ],
        },
        failNextUpdateOn: { collection: 'posts', itemId: '2' },
      });
      const cursor = makeInMemoryCursorStore();
      const lock = makeInMemoryLockStore();
      const { writer, sessions } = makeInMemorySyncLogWriter();

      const adapters: OrchestratorAdapters = {
        ...makeAdapters({ localazyContentFetcher: fetcher, directusApi, cursorStore: cursor.store, lockStore: lock.store }),
        syncLogWriter: writer,
        syncLogInitiator: { initiator: 'user-7', initiatorUser: 'user-7' },
      };

      await runIncrementalImport(adapters, baseParams);

      const session = Array.from(sessions.values())[0]!;
      expect(session.status).toBe('partial');
      const errorEntries = session.entries.filter((e) => e.level === 'error');
      expect(errorEntries.length).toBeGreaterThan(0);
      expect(errorEntries[0]!.message).toMatch(/Upsert error:/);
    });

    it('up-to-date path closes the session with status skipped', async () => {
      const empty: LocalazyContent = { collections: new Map(), translationStrings: new Map() };
      const { fetcher } = makeContentFetcher(empty);
      const { writer, sessions } = makeInMemorySyncLogWriter();
      const adapters: OrchestratorAdapters = {
        ...makeAdapters({ localazyContentFetcher: fetcher }),
        syncLogWriter: writer,
        syncLogInitiator: { initiator: 'user-7', initiatorUser: 'user-7' },
      };
      await runIncrementalImport(adapters, baseParams);
      const session = Array.from(sessions.values())[0]!;
      expect(session.status).toBe('skipped');
      expect(session.entries.some((e) => e.message.includes('Already up to date'))).toBe(true);
    });

    it('aborted fetch finalises the session as aborted', async () => {
      const { fetcher } = makeContentFetcher('failure');
      const { writer, sessions } = makeInMemorySyncLogWriter();
      const adapters: OrchestratorAdapters = {
        ...makeAdapters({ localazyContentFetcher: fetcher }),
        syncLogWriter: writer,
        syncLogInitiator: { initiator: 'user-7', initiatorUser: 'user-7' },
      };
      await runIncrementalImport(adapters, baseParams);
      const session = Array.from(sessions.values())[0]!;
      // The orchestrator returns `aborted` from runImportBody when the fetch fails. The
      // wrapper finalises with that same status (not 'failed'), since no throw escaped
      // the body. The activity row shows "aborted" and the entry list includes the
      // explicit fetch-failed error line.
      expect(session.status).toBe('aborted');
      expect(session.entries.some((e) => e.level === 'error' && e.message.includes('fetch from Localazy failed'))).toBe(true);
    });

    it('no writer wired: orchestrator runs normally without any log calls', async () => {
      const empty: LocalazyContent = { collections: new Map(), translationStrings: new Map() };
      const { fetcher } = makeContentFetcher(empty);
      // No syncLogWriter / syncLogInitiator on the adapters bundle.
      const adapters = makeAdapters({ localazyContentFetcher: fetcher });
      const result = await runIncrementalImport(adapters, baseParams);
      expect(result.status).toBe('up-to-date');
    });

    it('skipped (lock-held) path does not start a session', async () => {
      const lock = makeInMemoryLockStore({
        in_progress: true,
        started_at: new Date(Date.now() - 5_000).toISOString(),
        last_heartbeat_at: new Date(Date.now() - 1_000).toISOString(),
        initiator: 'someone-else',
        pending: false,
        items_processed: 0,
        acquired_token: 'live',
      });
      const { fetcher } = makeContentFetcher({ collections: new Map(), translationStrings: new Map() });
      const { writer, sessions } = makeInMemorySyncLogWriter();
      const adapters: OrchestratorAdapters = {
        ...makeAdapters({ localazyContentFetcher: fetcher, lockStore: lock.store }),
        syncLogWriter: writer,
        syncLogInitiator: { initiator: 'user-7', initiatorUser: 'user-7' },
      };
      const result = await runIncrementalImport(adapters, baseParams);
      expect(result.status).toBe('skipped');
      expect(sessions.size).toBe(0); // no log row for skipped contenders
    });
  });
});
