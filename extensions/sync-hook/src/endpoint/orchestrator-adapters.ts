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
import { SyncLogSession } from '../../../common/models/collections-data/sync-log';
import { createSyncLogWriter, SyncLogFailureCallback } from '../../../common/services/orchestrator/sync-log-writer';
import { createServerSyncLogStorage } from '../shared/sync-log-storage';
import { FAILURE_NOTIFICATION_WINDOW_MS, shouldSuppressFailureNotification } from './notification-dedupe';

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
 * Configuration for the bell-icon notification side-effect on the server-side
 * `SyncLogWriter`. Optional — callers that don't need notifications (the unit tests,
 * future non-webhook paths) can omit it and the writer behaves exactly like the
 * module-side adapter.
 *
 * `recipientUserId` is the `automated_import_user` resolved by the webhook handler. We
 * already know they're an Admin (the gating layer confirmed it) so the bell icon will
 * be visible to them. `logger` is used only for the fire-and-forget error breadcrumb if
 * the notification write itself throws.
 */
type NotifyOnFailureConfig = {
  recipientUserId: string;
  logger: DirectusLogger;
};

/**
 * Server-side Sync-log writer. Composes the `ItemsService`-backed storage adapter with
 * the deep writer from `common/`, and — when `notifyOnFailure` is supplied — wires the
 * failure callback that emits a `directus_notifications` row (subject to the dedupe
 * window) addressed to the configured Webhook user. The callback owns its own try/catch
 * and logging so a missing notifications collection, permissions error, or other
 * write-time failure can't propagate up into the orchestrator's `finally` and mask the
 * primary outcome — and the deep writer additionally swallows callback errors as a
 * second-line safety.
 */
function buildSyncLogWriter(
  ItemsService: ItemsServiceCtor,
  schema: SchemaOverview,
  notifyOnFailure: NotifyOnFailureConfig | null,
): SyncLogWriter {
  const onFailure: SyncLogFailureCallback | undefined = notifyOnFailure
    ? async (sessionId, params) => {
        try {
          await emitFailureNotification({
            ItemsService,
            schema,
            sessionId,
            status: params.status,
            summary: params.summary,
            recipientUserId: notifyOnFailure.recipientUserId,
          });
        } catch (err) {
          notifyOnFailure.logger.warn({ err, sessionId }, 'Localazy webhook: failure notification emit threw');
        }
      }
    : undefined;

  return createSyncLogWriter({
    storage: createServerSyncLogStorage(ItemsService, schema),
    generateId: randomUUID,
    onFailure,
  });
}

/**
 * Read the most recent prior webhook-initiated failure session, excluding the session
 * that's about to emit the notification. Returns `null` when no such prior row exists.
 *
 * Filters on `initiator: 'webhook'` rather than `event_type: 'webhook'` because the
 * orchestrator persists `event_type: 'download-incremental'` (via `eventTypeForMode(mode)`)
 * for webhook-driven runs that reach `finish()`. The literal `'webhook'` `event_type`
 * only appears on rows written via `writeOutcomeSessionRow` — disabled / gating-fail
 * (no_user / user_missing / user_no_admin) / missing-content-transfer-setup /
 * missing-Localazy-project / dispatch-threw. Those paths bypass `SyncLogWriter.finish()`
 * and therefore never emit notifications themselves, BUT they ARE returned by this
 * lookup, so a `no_user` early-reject failure at T=0 can suppress an orchestrator-driven
 * failure notification at T=11h. That's intentional — if the operator already has
 * unfixed broken config, a fresh notification 11h later about a different failure mode
 * isn't more useful than the first one. `initiator` is the correct discriminator — the
 * webhook handler sets it explicitly via the orchestrator's `initiator: 'webhook'`
 * parameter, and `writeOutcomeSessionRow` writes the same string.
 *
 * The current-session exclusion (`id: { _neq: sessionId }`) matters because the
 * just-finalised row is itself a webhook failure — without the exclusion we'd suppress
 * the very notification we're trying to emit on the very first failure of a stretch.
 */
async function readMostRecentPriorWebhookFailure(
  ItemsService: ItemsServiceCtor,
  schema: SchemaOverview,
  excludeSessionId: string,
): Promise<{ finished_at: string | null } | null> {
  const service = makeItemsService<Partial<SyncLogSession>>(ItemsService, LOCALAZY_COLLECTIONS.syncLog, schema, null);
  const rows = await service.readByQuery({
    filter: {
      initiator: { _eq: 'webhook' },
      status: { _in: ['failed', 'partial', 'aborted'] },
      id: { _neq: excludeSessionId },
    },
    sort: ['-started_at'],
    limit: 1,
  });
  const row = rows[0];
  if (!row) return null;
  return { finished_at: row.finished_at ?? null };
}

/**
 * Notification row shape Directus' `directus_notifications` collection accepts. The
 * `status: 'inbox'` value mirrors what Directus' own UI uses for an unread notification
 * — the alternative is `'archived'`, which would file it away without showing on the
 * bell icon.
 *
 * Setting `collection` + `item` lets the bell-icon dropdown render the notification as a
 * clickable link to the corresponding `localazy_sync_log` row. The Activity detail page
 * picks up that route via Directus' standard `/admin/content/{collection}/{item}` URL
 * pattern (the module's Activity page mirrors that route under
 * `/admin/localazy/activity/{id}`; we let Directus pick the more general one for the
 * notification click-through).
 */
type DirectusNotificationRow = {
  recipient: string;
  subject: string;
  message: string;
  status: string;
  collection?: string;
  item?: string;
};

/**
 * Emit the failure notification, gated by the dedupe rule. Pulled into a free function so
 * the `finish()` call site stays readable; not exported because the dedupe + emit pair
 * is meaningful only as a unit.
 */
async function emitFailureNotification(args: {
  ItemsService: ItemsServiceCtor;
  schema: SchemaOverview;
  sessionId: string;
  status: string;
  summary: string;
  recipientUserId: string;
}): Promise<void> {
  const { ItemsService, schema, sessionId, status, summary, recipientUserId } = args;
  const prior = await readMostRecentPriorWebhookFailure(ItemsService, schema, sessionId);
  if (
    shouldSuppressFailureNotification({
      now: new Date(),
      mostRecentPriorFailure: prior,
      windowMs: FAILURE_NOTIFICATION_WINDOW_MS,
    })
  ) {
    return;
  }
  // Subject phrasing: `'partial'` gets a softer line because the import did run and some
  // content landed (the row gives the operator a click-through to per-language errors);
  // `'failed'` / `'aborted'` get the stronger "failed" subject because nothing landed.
  const service = makeItemsService<DirectusNotificationRow>(ItemsService, 'directus_notifications', schema, null);
  await service.createOne(
    {
      recipient: recipientUserId,
      subject: status === 'partial' ? 'Localazy automated import completed with errors' : 'Localazy automated import failed',
      message: summary,
      status: 'inbox',
      collection: LOCALAZY_COLLECTIONS.syncLog,
      item: sessionId,
    },
    { emitEvents: false } as MutationOptions,
  );
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
  /**
   * Directus user id that bell-icon failure notifications are addressed to. Optional —
   * when omitted (e.g. from the existing adapter tests that don't exercise the notify
   * path), the writer skips the notification emit and the rest of the adapter behaves
   * unchanged. The webhook handler always supplies the resolved `automated_import_user`
   * id here.
   */
  notificationRecipientUserId?: string | null;
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
  const { ItemsService, schema, logger, writeAccountability, localazyProject, notificationRecipientUserId } = input;
  const onDirectusError: ErrorSink = (err) => logger.error({ err }, 'Localazy webhook: orchestrator write error');

  const notifyOnFailure: NotifyOnFailureConfig | null = notificationRecipientUserId
    ? { recipientUserId: notificationRecipientUserId, logger }
    : null;

  return {
    cursorStore: buildCursorStore(ItemsService, schema, localazyProject, logger),
    lockStore: buildLockStore(ItemsService, schema),
    localazyContentFetcher: buildLocalazyContentFetcher(logger),
    progress: buildProgressSink(logger),
    directusApi: new WebhookDirectusApi(ItemsService, schema, writeAccountability),
    resolveLanguageFkField: buildResolveLanguageFkField(schema),
    onDirectusError,
    syncLogWriter: buildSyncLogWriter(ItemsService, schema, notifyOnFailure),
    // `syncLogInitiator` is supplied by the endpoint handler — it's the per-request
    // bit ("webhook" + `null` user), not adapter-state.
  };
}
