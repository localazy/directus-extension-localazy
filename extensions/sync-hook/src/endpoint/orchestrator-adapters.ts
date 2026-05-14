import { randomUUID } from 'node:crypto';
import type { Accountability, Item, MutationOptions, Query, SchemaOverview } from '@directus/types';
import { Project } from '@localazy/api-client';
import { DirectusApi } from '../../../common/interfaces/directus-api';
import { CURSOR_VERSION, SyncState } from '../../../common/models/collections-data/sync-state';
import { DirectusApiResultTranslationString } from '../../../common/models/translation-string';
import { mergeCursor, parseCursor, serializeCursor } from '../../../common/utilities/sync-cursor';
import {
  CursorStore,
  ErrorSink,
  LocalazyContentFetcher,
  LockStore,
  OrchestratorAdapters,
  ProgressSink,
  ResolveLanguageFkField,
  SyncLogWriter,
} from '../../../common/services/orchestrator/ports';
import { Locales } from '@localazy/api-client';
import { LocalazyApiThrottleService } from '../../../common/services/localazy-api-throttle-service';
import { ContentFromLocalazyService } from '../../../common/services/content-from-localazy-service';
import { uniqWith } from 'lodash';
import { useGetCollectionFromSchema } from '../hook/composables/use-get-collection-from-schema';
import type { DirectusLogger, ItemsServiceCtor } from '../hook/types/directus-services';
import { SyncLogEntry, SyncLogSession } from '../../../common/models/collections-data/sync-log';
import { appendEntryToJson, idsToTrim } from '../../../common/utilities/sync-log-helpers';

/**
 * Shape of the `localazy_sync_state` row the orchestrator's lock cares about. Mirrors the
 * full `SyncState` type's lock fields — kept narrow so the adapter doesn't accidentally
 * depend on cursor fields it doesn't touch.
 */
type LockRow = Pick<
  SyncState,
  | 'sync_in_progress'
  | 'sync_started_at'
  | 'sync_initiator'
  | 'sync_pending'
  | 'sync_items_processed'
  | 'sync_last_heartbeat_at'
  | 'acquired_token'
>;

/**
 * Localazy collection names mirrored from the module side. Keeping these constants
 * inline (rather than importing from the module workspace) avoids dragging Vue's runtime
 * into the server-side bundle.
 */
const LOCALAZY_COLLECTIONS = {
  syncState: 'localazy_sync_state',
  syncLog: 'localazy_sync_log',
} as const;

/**
 * Construct an `ItemsService` for a given collection using the supplied accountability.
 * Centralised so every adapter writes with consistent options (emitEvents off so hook
 * writes don't recurse, schema threaded through).
 */
function makeItemsService<T extends Item>(
  ItemsService: ItemsServiceCtor,
  collection: string,
  schema: SchemaOverview,
  accountability: Accountability | null,
) {
  return new ItemsService<T>(collection, { schema, accountability });
}

/**
 * Server-side `DirectusApi` adapter that runs writes under a supplied `Accountability`.
 * Mirrors the hook's `DirectusApiService` but threads accountability through so
 * webhook-driven writes are attributed to the configured `automated_import_user` rather
 * than the omnipotent `accountability: null`.
 *
 * `emitEvents: false` is preserved on writes — the webhook handler shouldn't recursively
 * re-trigger the upload hook when it persists translation rows.
 */
export class WebhookDirectusApi implements DirectusApi {
  private readonly ItemsService: ItemsServiceCtor;
  private readonly schema: SchemaOverview;
  private readonly accountability: Accountability | null;

  constructor(ItemsService: ItemsServiceCtor, schema: SchemaOverview, accountability: Accountability | null) {
    this.ItemsService = ItemsService;
    this.schema = schema;
    this.accountability = accountability;
  }

  async createDirectusItem<T extends Item>(collection: string, data: T): Promise<void> {
    const target = this.getCollection(collection);
    const { id: _id, ...rest } = data;
    const payload = rest as Partial<T>;
    const service = makeItemsService<T>(this.ItemsService, collection, this.schema, this.accountability);
    if (target?.singleton === true) {
      await service.upsertSingleton(payload, { emitEvents: false } as MutationOptions);
    } else {
      await service.createOne(payload, { emitEvents: false } as MutationOptions);
    }
  }

  async updateDirectusItem<T extends Item>(collection: string, itemId: number | string, data: T): Promise<void> {
    const target = this.getCollection(collection);
    const service = makeItemsService<T>(this.ItemsService, collection, this.schema, this.accountability);
    if (target?.singleton === true) {
      await service.upsertSingleton(data as Partial<T>, { emitEvents: false } as MutationOptions);
      return;
    }
    await service.updateOne(itemId, data as Partial<T>, { emitEvents: false } as MutationOptions);
  }

  async fetchDirectusItems<T extends Item>(collection: string, query: Query = {}): Promise<T[]> {
    const service = makeItemsService<T>(this.ItemsService, collection, this.schema, this.accountability);
    return service.readByQuery(query);
  }

  async fetchSettings(): Promise<Item | null> {
    const service = makeItemsService<Item>(this.ItemsService, 'directus_settings', this.schema, this.accountability);
    const rows = await service.readByQuery({ fields: ['translation_strings'], limit: -1 });
    return rows[0] ?? null;
  }

  async fetchTranslationStrings(): Promise<DirectusApiResultTranslationString[]> {
    const service = makeItemsService<DirectusApiResultTranslationString>(
      this.ItemsService,
      'directus_translations',
      this.schema,
      this.accountability,
    );
    return service.readByQuery({ limit: -1 });
  }

  async upsertTranslationString<T extends Item>(payload: T): Promise<void> {
    const service = makeItemsService<T>(this.ItemsService, 'directus_translations', this.schema, this.accountability);
    await service.upsertOne(payload, { emitEvents: false } as MutationOptions);
  }

  async updateSettings<T extends Item>(payload: T): Promise<void> {
    const service = makeItemsService<T>(this.ItemsService, 'directus_settings', this.schema, this.accountability);
    await service.upsertSingleton(payload, { emitEvents: false } as MutationOptions);
  }

  getCollection(collection: string) {
    const { getCollection } = useGetCollectionFromSchema(this.schema);
    return getCollection(collection);
  }
}

/**
 * Read the `localazy_sync_state` singleton with admin accountability. Lock + cursor are
 * extension-internal — they don't belong to the configured webhook user — so all reads
 * and writes run unconditionally as admin (`accountability: null`).
 */
async function readSyncState(ItemsService: ItemsServiceCtor, schema: SchemaOverview): Promise<Partial<SyncState>> {
  const service = makeItemsService<Partial<SyncState>>(ItemsService, LOCALAZY_COLLECTIONS.syncState, schema, null);
  const rows = await service.readByQuery({ limit: -1 });
  return rows[0] ?? {};
}

async function writeSyncState(ItemsService: ItemsServiceCtor, schema: SchemaOverview, payload: Partial<SyncState>): Promise<void> {
  const service = makeItemsService<Partial<SyncState>>(ItemsService, LOCALAZY_COLLECTIONS.syncState, schema, null);
  await service.upsertSingleton(payload, { emitEvents: false } as MutationOptions);
}

/**
 * Cursor adapter — reads/writes the JSON-encoded `processed_keys` column on the
 * `localazy_sync_state` singleton. The merge-on-persist contract matches the module-side
 * adapter: re-read the latest disk state, merge cell-wise via `max(event)`, write back.
 *
 * Errors are swallowed inside `persist` (matching the module side) — a flush failure
 * shouldn't take down the sync; the next flush retries; the orchestrator's final flush
 * in `finally` is the backstop.
 */
function buildCursorStore(
  ItemsService: ItemsServiceCtor,
  schema: SchemaOverview,
  localazyProject: Project,
  logger: DirectusLogger,
): CursorStore {
  return {
    async load() {
      const row = await readSyncState(ItemsService, schema);
      return {
        cursor: parseCursor(row.processed_keys ?? '{}'),
        projectId: row.cursor_project_id ?? '',
      };
    },
    async persist(inMemory) {
      try {
        const row = await readSyncState(ItemsService, schema);
        const onDisk = parseCursor(row.processed_keys ?? '{}');
        const merged = mergeCursor(onDisk, inMemory);
        await writeSyncState(ItemsService, schema, {
          processed_keys: serializeCursor(merged),
          cursor_project_id: localazyProject.id || '',
          cursor_version: CURSOR_VERSION,
          last_sync_at: new Date().toISOString(),
        });
      } catch (err) {
        // Log at debug so a noisy run doesn't flood the server log, but leave a
        // breadcrumb the operator can find if a webhook run reports zero progress.
        logger.debug({ err }, 'Localazy webhook: cursor persist failed; will retry on next flush');
      }
    },
  };
}

/**
 * Project the persisted row onto the orchestrator's `LockState` shape. Same pattern as
 * the module side — the persisted column names (`sync_in_progress`, `sync_started_at`,
 * …) are friendlier for admins reading the row in the data studio, while the
 * orchestrator's port uses the abstract names (`in_progress`, `started_at`, …).
 */
function projectLockState(row: LockRow | Partial<SyncState>) {
  return {
    in_progress: row.sync_in_progress ?? false,
    started_at: row.sync_started_at ?? null,
    initiator: row.sync_initiator ?? '',
    pending: row.sync_pending ?? false,
    items_processed: row.sync_items_processed ?? 0,
    last_heartbeat_at: row.sync_last_heartbeat_at ?? null,
    acquired_token: row.acquired_token ?? '',
  };
}

/**
 * Lock adapter — same CAS-style contract as the module side, but reading/writing through
 * `ItemsService` instead of `useApi()`. Always uses admin accountability: the lock is
 * extension-internal state, not user-attributable.
 */
function buildLockStore(ItemsService: ItemsServiceCtor, schema: SchemaOverview): LockStore {
  return {
    async read() {
      const row = await readSyncState(ItemsService, schema);
      return projectLockState(row);
    },
    async acquire(initiator, token) {
      try {
        await writeSyncState(ItemsService, schema, {
          sync_in_progress: true,
          sync_started_at: new Date().toISOString(),
          sync_initiator: initiator,
          sync_items_processed: 0,
          sync_last_heartbeat_at: null,
          acquired_token: token,
        });
      } catch {
        return null;
      }
      const verify = await readSyncState(ItemsService, schema);
      return verify.acquired_token === token ? token : null;
    },
    async heartbeat(token, itemsProcessed) {
      try {
        const row = await readSyncState(ItemsService, schema);
        if (row.acquired_token !== token) return;
        await writeSyncState(ItemsService, schema, {
          sync_last_heartbeat_at: new Date().toISOString(),
          sync_items_processed: itemsProcessed,
        });
      } catch {
        // Swallow — a transient heartbeat failure must not take down the sync.
      }
    },
    async release(token) {
      try {
        const row = await readSyncState(ItemsService, schema);
        if (row.acquired_token !== token) return { wasPending: false };
        const wasPending = row.sync_pending ?? false;
        await writeSyncState(ItemsService, schema, {
          sync_in_progress: false,
          sync_started_at: null,
          sync_initiator: '',
          sync_pending: false,
          sync_items_processed: 0,
          sync_last_heartbeat_at: null,
          acquired_token: '',
        });
        return { wasPending };
      } catch {
        return { wasPending: false };
      }
    },
    async markPending() {
      try {
        await writeSyncState(ItemsService, schema, { sync_pending: true });
      } catch {
        // Swallow — the contender already gave up running this turn.
      }
    },
  };
}

/**
 * Wraps the Localazy file/keys fetch + parse pipeline so the orchestrator gets a port-shaped
 * fetcher. Mirrors the module-side `importFromLocalazyService.importContentFromLocalazy`
 * shape (including `filterKeysForLanguage`) but uses common's `ContentFromLocalazyService`
 * + `LocalazyApiThrottleService` directly so we don't drag the module workspace into the
 * server-side bundle.
 *
 * The hook side already has its own `import-from-localazy-service` for the upload flow;
 * we deliberately don't reuse it here because (a) it lacks `filterKeysForLanguage` (the
 * cursor filter the orchestrator needs for incremental sync), and (b) inlining keeps
 * the dependency graph linear.
 */
function buildLocalazyContentFetcher(logger: DirectusLogger): LocalazyContentFetcher {
  async function loadDirectusFile(token: string, projectId: string) {
    if (!token) return null;
    try {
      const files = await LocalazyApiThrottleService.listFiles(token, { project: projectId });
      return files.find((file) => file.name === 'directus.json') || null;
    } catch (err) {
      logger.warn({ err }, 'Localazy webhook: listFiles failed');
      return null;
    }
  }

  return {
    async fetchContent(input) {
      try {
        const uniqueLocalazyForms = uniqWith(input.languages, (a, b) => a.localazyForm === b.localazyForm);
        const directusFile = await loadDirectusFile(input.localazyData.access_token, input.localazyProject.id || '');
        if (!directusFile) {
          logger.info('Localazy webhook: nothing to import — export content to Localazy first');
          return { success: false };
        }

        const sourceKeysPerLanguage = await Promise.all(
          uniqueLocalazyForms.map(async (lang) => {
            try {
              const keys = await LocalazyApiThrottleService.listAllKeysInFileForLanguage(input.localazyData.access_token, {
                project: input.localazyProject.id,
                file: directusFile.id,
                lang: lang.localazyForm as Locales,
                event: true,
              });
              return { language: lang.directusForm, keys };
            } catch (err) {
              logger.warn({ err, language: lang.directusForm }, "Localazy webhook: couldn't fetch language content");
              throw err;
            }
          }),
        );

        // Apply cursor filter before the parser — same hook the module-side service uses.
        const filtered = input.filterKeysForLanguage
          ? sourceKeysPerLanguage.map(({ language, keys }) => ({
              language,
              keys: input.filterKeysForLanguage!(language, keys),
            }))
          : sourceKeysPerLanguage;

        return {
          success: true,
          content: ContentFromLocalazyService.parseLocalazyContent(filtered, input.enabledFields),
        };
      } catch (err) {
        logger.error({ err }, 'Localazy webhook: fetch from Localazy threw');
        return { success: false };
      }
    },
  };
}

/**
 * Resolve the FK column on a translation collection that points back at the languages
 * collection. Mirrors the module-side adapter but reads `schema.relations` directly
 * (server has the schema at hand via the endpoint context).
 *
 * Falls back to `'languages_code'` (the Directus convention) when no relation matches —
 * same fallback as the module side. The fallback is what keeps the old behaviour for
 * installs that haven't customised the FK name.
 */
function buildResolveLanguageFkField(schema: SchemaOverview): ResolveLanguageFkField {
  return (parentCollection, translationField, languagesCollection) => {
    const rels = schema.relations.filter((r) => r.collection === parentCollection && r.field === translationField);
    const languageRel = rels.find((r) => r.related_collection === languagesCollection);
    return languageRel?.field || 'languages_code';
  };
}

/**
 * Routes orchestrator progress messages to the Directus logger. Webhook flows have no
 * progress modal — the operator's only feedback is the server log + the persisted
 * sync_log session.
 */
function buildProgressSink(logger: DirectusLogger): ProgressSink {
  return (msg) => {
    const text = `[localazy webhook] ${msg.message}`;
    if (msg.level === 'error') {
      logger.error(text);
    } else if (msg.level === 'warn') {
      logger.warn(text);
    } else {
      logger.info(text);
    }
  };
}

/**
 * Server-side `SyncLogWriter`. Same per-session promise chain as the module-side adapter
 * so concurrent `appendEntry` fire-and-forgets don't interleave their read-modify-write
 * cycles. Writes through `ItemsService` instead of `useApi()`.
 *
 * Retention trim deletes everything past `SYNC_LOG_RETENTION` rows ordered by
 * `started_at desc`. Directus' `ItemsService.deleteMany(ids)` accepts an array of ids
 * which maps to the SQL `DELETE … WHERE id IN (…)` bulk delete.
 */
function buildSyncLogWriter(ItemsService: ItemsServiceCtor, schema: SchemaOverview): SyncLogWriter {
  const appendChains = new Map<string, Promise<void>>();

  async function readEntries(sessionId: string): Promise<string> {
    const service = makeItemsService<Partial<SyncLogSession>>(ItemsService, LOCALAZY_COLLECTIONS.syncLog, schema, null);
    const row = await service.readOne(sessionId);
    return row?.entries ?? '[]';
  }

  async function doAppend(sessionId: string, entry: SyncLogEntry) {
    try {
      const current = await readEntries(sessionId);
      const next = appendEntryToJson(current, entry);
      const service = makeItemsService<Partial<SyncLogSession>>(ItemsService, LOCALAZY_COLLECTIONS.syncLog, schema, null);
      await service.updateOne(sessionId, { entries: next }, { emitEvents: false } as MutationOptions);
    } catch {
      // Swallow at this level — a single failed append must not take down the sync.
    }
  }

  async function trimToRetention() {
    try {
      const service = makeItemsService<Partial<SyncLogSession>>(ItemsService, LOCALAZY_COLLECTIONS.syncLog, schema, null);
      const rows = await service.readByQuery({ limit: -1, sort: ['-started_at'], fields: ['id'] });
      const ids = rows.map((r) => r.id).filter((id): id is string => typeof id === 'string');
      const toTrim = idsToTrim(ids);
      if (toTrim.length === 0) return;
      await service.deleteMany(toTrim, { emitEvents: false } as MutationOptions);
    } catch {
      // Trim is best-effort — failing once just lets the table grow a little past
      // `SYNC_LOG_RETENTION`; the next finish will retry.
    }
  }

  return {
    async startSession(params) {
      const id = randomUUID();
      const service = makeItemsService<Partial<SyncLogSession>>(ItemsService, LOCALAZY_COLLECTIONS.syncLog, schema, null);
      await service.createOne(
        {
          id,
          event_type: params.eventType,
          status: 'in_progress',
          started_at: new Date().toISOString(),
          finished_at: null,
          initiator: params.initiator,
          initiator_user: params.initiatorUser,
          summary: '',
          items_processed: 0,
          entries: '[]',
        },
        { emitEvents: false } as MutationOptions,
      );
      return id;
    },

    async appendEntry(sessionId, entry) {
      const prior = appendChains.get(sessionId) ?? Promise.resolve();
      const next = prior.catch(() => undefined).then(() => doAppend(sessionId, entry));
      appendChains.set(sessionId, next);
      void next.finally(() => {
        if (appendChains.get(sessionId) === next) appendChains.delete(sessionId);
      });
      return next;
    },

    async finish(sessionId, params) {
      try {
        const service = makeItemsService<Partial<SyncLogSession>>(ItemsService, LOCALAZY_COLLECTIONS.syncLog, schema, null);
        await service.updateOne(
          sessionId,
          {
            status: params.status,
            finished_at: new Date().toISOString(),
            summary: params.summary,
            items_processed: params.itemsProcessed,
          },
          { emitEvents: false } as MutationOptions,
        );
      } catch {
        // Even finalisation is best-effort.
      }
      await trimToRetention();
    },
  };
}

export type ServerOrchestratorAdaptersInput = {
  ItemsService: ItemsServiceCtor;
  schema: SchemaOverview;
  logger: DirectusLogger;
  /**
   * Accountability that orchestrator-driven writes (translation collection upserts) run
   * under. Constructed from the configured `automated_import_user` and their role; lock
   * / cursor / sync_log writes use admin accountability internally regardless of this
   * value.
   */
  writeAccountability: Accountability | null;
  localazyProject: Project;
};

/**
 * Assemble the full `OrchestratorAdapters` bundle the webhook handler hands to
 * `runIncrementalImport`. Server-side mirror of the module's `buildOrchestratorAdapters`.
 *
 * `onDirectusError` routes to the logger at error level. The webhook flow has no live UI
 * to surface errors into, so the server log is the only audit channel beyond the
 * persisted `localazy_sync_log` row (which already captures per-error entries via the
 * orchestrator's `wrappedErrorSink`).
 */
export function buildServerOrchestratorAdapters(input: ServerOrchestratorAdaptersInput): OrchestratorAdapters & {
  syncLogWriter: SyncLogWriter;
} {
  const { ItemsService, schema, logger, writeAccountability, localazyProject } = input;
  const onDirectusError: ErrorSink = (err) => logger.error({ err }, 'Localazy webhook: orchestrator write error');

  return {
    cursorStore: buildCursorStore(ItemsService, schema, localazyProject, logger),
    lockStore: buildLockStore(ItemsService, schema),
    localazyContentFetcher: buildLocalazyContentFetcher(logger),
    progress: buildProgressSink(logger),
    directusApi: new WebhookDirectusApi(ItemsService, schema, writeAccountability),
    resolveLanguageFkField: buildResolveLanguageFkField(schema),
    onDirectusError,
    syncLogWriter: buildSyncLogWriter(ItemsService, schema),
    // `syncLogInitiator` is supplied by the endpoint handler — it's the per-request
    // bit ("webhook" + `null` user), not adapter-state.
  };
}
