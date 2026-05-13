import { describe, it, expect } from 'vitest';
import type { Item, Query } from '@directus/types';
import type { Key, Project } from '@localazy/api-client';
import { runIncrementalImport, ImportProgressIds } from './incremental-import-orchestrator';
import { UpsertProgressIds } from './upsert-localazy-content';
import {
  CursorStore,
  ErrorSink,
  FetchLocalazyContentInput,
  LocalazyContentFetcher,
  OrchestratorAdapters,
  ProgressSink,
  ResolveLanguageFkField,
} from './ports';
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

function makeAdapters(overrides: Partial<OrchestratorAdapters>): OrchestratorAdapters {
  const { api } = makeDirectusApi();
  const { fetcher } = makeContentFetcher({ collections: new Map(), translationStrings: new Map() });
  const { store } = makeInMemoryCursorStore();
  const { sink } = makeProgressSink();
  const onDirectusError: ErrorSink = () => {};
  return {
    cursorStore: store,
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

    const result = await runIncrementalImport(
      makeAdapters({ localazyContentFetcher: fetcher, directusApi, cursorStore: cursor.store, progress: sink }),
      baseParams,
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

    // Cursor persisted at end with all three (lang, keyId, event) cells.
    expect(cursor.persistCalls.length).toBeGreaterThanOrEqual(1);
    const final = cursor.diskCursor.processed_keys;
    expect(final.fr).toEqual({ 'fr-1': 10 });
    expect(final.de).toEqual({ 'de-1': 20 });
    expect(final.es).toEqual({ 'es-1': 30 });

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

    const result = await runIncrementalImport(
      makeAdapters({ localazyContentFetcher: fetcher, directusApi, cursorStore: cursor.store, progress: sink }),
      baseParams,
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
      cursor: { processed_keys: { fr: { 'fr-1': 999 } } },
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
      cursor: { processed_keys: { fr: { 'fr-1': 999 } } },
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

    const result = await runIncrementalImport(
      makeAdapters({ localazyContentFetcher: fetcher, directusApi, cursorStore: cursor.store }),
      baseParams,
    );

    expect(result.status).toBe('aborted');
    expect(result.summary).toBeUndefined();
    expect(updateCalls).toHaveLength(0);
    expect(cursor.persistCalls).toHaveLength(0); // no cursor touch when the fetch never succeeded
  });

  it('throttled flush: many keys trigger one mid-flow persist + a final persist', async () => {
    // Build a payload that exceeds the throttle threshold (minimum 50). Use 150 keys
    // spread across 150 items so each upsertItemFromLocalazyContent emits one triple
    // per PATCH — the throttle should fire ~3 times (every 50 written triples) plus
    // the final flush in `finally`.
    const perLang: Array<{ language: string; itemId: string; event?: number }> = [];
    for (let i = 1; i <= 150; i += 1) {
      perLang.push({ language: 'fr', itemId: String(i), event: i });
    }
    const content = buildCollectionContent('posts', perLang);

    const itemsInPosts: Item[] = perLang.map((p) => ({ id: p.itemId, translations: [] }));
    const { fetcher } = makeContentFetcher(content);
    const { api: directusApi } = makeDirectusApi({ itemsByCollection: { posts: itemsInPosts } });
    const cursor = makeInMemoryCursorStore();

    const result = await runIncrementalImport(
      makeAdapters({ localazyContentFetcher: fetcher, directusApi, cursorStore: cursor.store }),
      baseParams,
    );

    expect(result.status).toBe('completed');
    expect(result.itemsProcessed).toBe(150);
    // Throttle threshold for 150 keys is max(50, ceil(150/10)) = 50. We expect at least
    // 2 mid-flow flushes (at 50 and 100 keys written) plus 1 final flush => >= 3 total.
    expect(cursor.persistCalls.length).toBeGreaterThanOrEqual(3);

    // Final persisted cursor records all 150 (fr, key) cells.
    expect(Object.keys(cursor.diskCursor.processed_keys.fr ?? {}).length).toBe(150);
  });

  it('error in upsert: the `finally` block still persists what was written before the failure', async () => {
    // Build content for 3 items; fail the second PATCH. Items 1 (and ONLY item 1, since
    // PATCH-then-mark gates `onWritten` on success) should land in the persisted cursor.
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
    // Cursor reflects only the successful writes.
    const fr = cursor.diskCursor.processed_keys.fr ?? {};
    expect(fr['fr-1']).toBe(10);
    expect(fr['fr-3']).toBe(30);
    expect(fr['fr-2']).toBeUndefined();
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
});
