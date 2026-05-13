import { useApi } from '@directus/extensions-sdk';
import { storeToRefs } from 'pinia';
import { CURSOR_VERSION, SyncCursor } from '../../../common/models/collections-data/sync-state';
import { mergeCursor, parseCursor, serializeCursor } from '../../../common/utilities/sync-cursor';
import {
  CursorStore,
  ErrorSink,
  LocalazyContentFetcher,
  LockState,
  LockStore,
  OrchestratorAdapters,
  ProgressSink,
  ResolveLanguageFkField,
} from '../../../common/services/orchestrator/ports';
import { ImportProgressIds } from '../../../common/services/orchestrator/incremental-import-orchestrator';
import { UpsertProgressIds } from '../../../common/services/orchestrator/upsert-localazy-content';
import { importFromLocalazyService } from './import-from-localazy-service';
import { DirectusModuleApi } from './directus-module-api';
import { useDirectusCollectionsStore, useDirectusRelationsStore } from '../composables/use-directus-stores';
import { useLocalazyStore } from '../stores/localazy-store';
import { useLocalazySyncStateStore } from '../stores/localazy-sync-state-store';
import { useProgressTrackerStore } from '../stores/progress-tracker-store';
import { useErrorsStore } from '../stores/errors-store';
import { ProgressTrackerId } from '../enums/progress-tracker-id';
import { AnalyticsService } from '../../../common/services/analytics-service';
import { ExportToLocalazyCommonService } from '../../../common/services/export-to-localazy-common-service';
import { Settings } from '../../../common/models/collections-data/settings';

/**
 * Maps the orchestrator's stable string progress ids to the module's `ProgressTrackerId`
 * enum values. Keeps the de-dupe-by-id semantics of the progress modal intact across the
 * lift — the orchestrator emits `'fetching-translations'`, the modal still sees
 * `ProgressTrackerId.FETCHING_TRANSLATIONS` and replaces in place.
 */
const PROGRESS_ID_MAP: Record<string, ProgressTrackerId> = {
  [ImportProgressIds.FETCHING_TRANSLATIONS]: ProgressTrackerId.FETCHING_TRANSLATIONS,
  [ImportProgressIds.CHANGES_SUMMARY]: ProgressTrackerId.CHANGES_SUMMARY,
  [ImportProgressIds.UP_TO_DATE]: ProgressTrackerId.UP_TO_DATE,
  [ImportProgressIds.IMPORT_FINISHED]: ProgressTrackerId.IMPORT_FINISHED,
  [UpsertProgressIds.UPDATING_DIRECTUS_COLLECTION]: ProgressTrackerId.UPDATING_DIRECTUS_COLLECTION,
  [UpsertProgressIds.UPDATING_TRANSLATION_STRINGS]: ProgressTrackerId.UPDATING_TRANSLATION_STRINGS,
  [UpsertProgressIds.UPDATING_DIRECTUS_COLLECTION_ERROR]: ProgressTrackerId.UPDATING_DIRECTUS_COLLECTION_ERROR,
};

/**
 * Builds the orchestrator's `CursorStore` port from the Pinia sync-state store. Both
 * `load` and `persist` follow the merge-on-persist contract: `persist` re-reads the
 * latest on-disk cursor, merges via `max(event)`, writes back. Errors are intentionally
 * swallowed inside `persist` so a flush failure can't take down a sync — the next flush
 * retries, and the orchestrator's final flush in `finally` is the backstop.
 */
function buildCursorStore(): CursorStore {
  const syncStateStore = useLocalazySyncStateStore();
  const { data: syncStateData } = storeToRefs(syncStateStore);
  const localazyStore = useLocalazyStore();
  const { localazyProject } = storeToRefs(localazyStore);

  return {
    async load() {
      // The sync-state singleton is already hydrated by `useLocalazyBoot`. Reading the
      // current store value is sufficient — no extra fetch needed at orchestrator start.
      return {
        cursor: parseCursor(syncStateData.value.processed_keys),
        projectId: syncStateData.value.cursor_project_id,
      };
    },
    async persist(inMemory: SyncCursor) {
      try {
        await syncStateStore.reload();
        const onDisk = parseCursor(syncStateData.value.processed_keys);
        const merged = mergeCursor(onDisk, inMemory);
        await syncStateStore.save({
          processed_keys: serializeCursor(merged),
          cursor_project_id: localazyProject.value?.id || '',
          cursor_version: CURSOR_VERSION,
          last_sync_at: new Date().toISOString(),
        });
      } catch {
        // The error has already been surfaced via the errors store inside `save`. We
        // intentionally swallow it here so a flush failure can't take down the sync; the
        // next flush attempt will retry, and the final flush at end-of-sync acts as a
        // last-resort backstop.
      }
    },
  };
}

/**
 * Snapshot the lock-relevant fields of the `localazy_sync_state` singleton into the
 * shape the orchestrator's `LockStore` port expects. Kept private to this file because
 * the projection from the persisted `SyncState` shape to `LockState` is purely a naming
 * adapter — the orchestrator wants `in_progress`, the row stores `sync_in_progress`.
 */
function projectLockState(syncState: {
  sync_in_progress: boolean;
  sync_started_at: string | null;
  sync_initiator: string;
  sync_pending: boolean;
  sync_items_processed: number;
  sync_last_heartbeat_at: string | null;
  acquired_token: string;
}): LockState {
  return {
    in_progress: syncState.sync_in_progress,
    started_at: syncState.sync_started_at,
    initiator: syncState.sync_initiator,
    pending: syncState.sync_pending,
    items_processed: syncState.sync_items_processed,
    last_heartbeat_at: syncState.sync_last_heartbeat_at,
    acquired_token: syncState.acquired_token,
  };
}

/**
 * Builds the orchestrator's `LockStore` port from the Pinia sync-state store. The
 * orchestrator already gated this call with its own `read()` (deciding live vs.
 * stale vs. free) — `acquire()` here only performs the *atomic* portion: write our
 * token + zeroed per-run counters → re-read → verify `acquired_token` is still
 * ours. If a concurrent contender wrote between our write and the verify, their
 * token wins and we surrender.
 *
 * Under concurrent acquires over plain HTTP, the verify-after-write is
 * best-effort: both contenders' verify reads can land in a window that yields
 * false-positive winners for both sides. This is acceptable because the lock is
 * advisory — `heartbeat` and `release` are token-gated, so only the contender
 * whose token is the one finally on disk persists any state. Cursor
 * merge-on-persist + idempotent upserts make duplicate runs correct (just
 * wasteful).
 *
 * Heartbeat and release are token-gated — they re-read the row and no-op if the
 * on-disk `acquired_token` no longer matches the caller's. This defends against
 * the "stolen lock" case: a stale holder wakes up after a contender took over
 * and tries to release a lock it no longer owns.
 */
function buildLockStore(): LockStore {
  const syncStateStore = useLocalazySyncStateStore();
  const { data: syncStateData } = storeToRefs(syncStateStore);

  return {
    async read() {
      await syncStateStore.reload();
      return projectLockState(syncStateData.value);
    },
    async acquire(initiator, token) {
      try {
        // Acquire write: stamp our token, reset all per-run counters / timestamps so the
        // new holder starts from a clean slate. `sync_pending` is intentionally NOT
        // written here — we preserve whatever's on disk so a concurrent contender's
        // `markPending()` survives our acquire. Release clears the bit explicitly; a
        // leftover bit from a prior run results in at most one cursor-bounded no-op
        // re-fire.
        await syncStateStore.save({
          sync_in_progress: true,
          sync_started_at: new Date().toISOString(),
          sync_initiator: initiator,
          sync_items_processed: 0,
          sync_last_heartbeat_at: null,
          acquired_token: token,
        });
      } catch {
        // The error has already surfaced via the errors store inside `save`. We treat
        // a failed write as a CAS loss — return null so the orchestrator marks pending
        // and surrenders rather than running with an ambiguous lock state.
        return null;
      }
      // Re-read to verify our token survived. If a concurrent contender wrote between
      // our acquire and this read, their token wins and we surrender.
      await syncStateStore.reload();
      return syncStateData.value.acquired_token === token ? token : null;
    },
    async heartbeat(token, itemsProcessed) {
      try {
        // Token-gated: only bump the heartbeat if we still own the lock. The reload is
        // a guard against the stolen-lock case described above.
        await syncStateStore.reload();
        if (syncStateData.value.acquired_token !== token) {
          return;
        }
        await syncStateStore.save({
          sync_last_heartbeat_at: new Date().toISOString(),
          sync_items_processed: itemsProcessed,
        });
      } catch {
        // Swallow — a transient heartbeat failure must not take down the sync. The next
        // tick retries; the orchestrator's release path is the backstop that always runs.
      }
    },
    async release(token) {
      try {
        await syncStateStore.reload();
        if (syncStateData.value.acquired_token !== token) {
          // Lock was stolen (e.g. our run exceeded the 2 h ceiling and a contender
          // took over). We must not clobber the new holder's state — return as if
          // there was nothing pending so the caller doesn't re-fire on stolen state.
          return { wasPending: false };
        }
        const wasPending = syncStateData.value.sync_pending;
        await syncStateStore.save({
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
        // Swallow — release failures shouldn't propagate (we're inside the
        // orchestrator's `finally`). The next acquire will see the stale lock as
        // either stale-by-heartbeat or stale-by-ceiling and take over cleanly.
        return { wasPending: false };
      }
    },
    async markPending() {
      try {
        await syncStateStore.save({ sync_pending: true });
      } catch {
        // Swallow — the contender already gave up running this turn, the missing dirty
        // bit just means we don't re-fire automatically. The user can retry manually.
      }
    },
  };
}

/**
 * Wraps `importFromLocalazyService.importContentFromLocalazy` so the orchestrator gets a
 * port-shaped `fetchContent`. Module-specific concerns (error reporting via Pinia,
 * Localazy-not-connected guard, "nothing to import" / "couldn't fetch" progress messages)
 * stay here so the orchestrator itself doesn't know about them.
 */
function buildLocalazyContentFetcher(): LocalazyContentFetcher {
  const { addProgressMessage } = useProgressTrackerStore();
  const { addLocalazyError } = useErrorsStore();
  const { localazyProject } = storeToRefs(useLocalazyStore());

  return {
    async fetchContent(input) {
      if (!localazyProject.value) {
        return { success: false };
      }
      try {
        const result = await importFromLocalazyService.importContentFromLocalazy({
          languages: input.languages,
          enabledFields: input.enabledFields,
          localazyData: input.localazyData,
          localazyProject: input.localazyProject,
          filterKeysForLanguage: input.filterKeysForLanguage,
          progressCallbacks: {
            nothingToImport: () => {
              addProgressMessage({
                id: ProgressTrackerId.NOTHING_TO_IMPORT,
                type: 'error',
                message: 'Nothing to import. Please export content to Localazy first.',
              });
            },
            couldNotFetchContent: (language) => {
              addProgressMessage({
                id: ProgressTrackerId.FETCHING_CONTENT_FROM_LOCALAZY,
                type: 'error',
                message: `(${language}) Couldn't fetch content from Localazy`,
              });
            },
          },
        });
        return result;
      } catch (e: unknown) {
        addLocalazyError(e, { type: 'import', userId: input.localazyData.user_id || '', orgId: input.localazyProject.orgId });
        return { success: false };
      }
    },
  };
}

/**
 * Routes orchestrator-emitted progress messages to the Pinia progress-tracker store.
 * `mode: 'add'` pushes (the orchestrator uses this for the run header and the final
 * "Imported …" line); `mode: 'upsert'` replaces by id (used for in-place updates like
 * "Updating posts (3/12)"). Severity levels map to the existing `'error'` / `undefined`
 * tracker types.
 */
function buildProgressSink(): ProgressSink {
  const { addProgressMessage, upsertProgressMessage } = useProgressTrackerStore();

  return (msg) => {
    const mappedId = PROGRESS_ID_MAP[String(msg.id)];
    if (mappedId === undefined) {
      // Defensive: an orchestrator change might add a new id without updating the map.
      // Silently skipping keeps the sync running rather than crashing on a progress write.
      return;
    }
    const type = msg.level === 'error' ? 'error' : undefined;
    if (msg.mode === 'add') {
      addProgressMessage({ id: mappedId, message: msg.message, ...(type ? { type } : {}) });
    } else {
      upsertProgressMessage(mappedId, { message: msg.message, ...(type ? { type } : {}) });
    }
  };
}

/**
 * The Pinia relations store knows the active schema. The orchestrator uses this to find
 * the FK column on each translation collection (Directus convention is
 * `languages_code`, but real installs often diverge — `lang_code`, `language`, etc.).
 * Falls back to `languages_code` when the relation can't be located.
 */
function buildResolveLanguageFkField(): ResolveLanguageFkField {
  const relationsStore = useDirectusRelationsStore();
  return (parentCollection, translationField, languagesCollection) => {
    const relations = relationsStore.getRelationsForField(parentCollection, translationField);
    const languageRelation = relations.find((r) => r.related_collection === languagesCollection);
    return languageRelation?.field || 'languages_code';
  };
}

type BuildAdaptersInput = {
  /**
   * Settings, languages, and project data are read at call time so analytics fires with
   * the same values the orchestrator ran with. The composable still owns "what to sync";
   * the adapters just expose access.
   */
  getAnalyticsContext: () => {
    userId: string;
    orgId: string;
    localazyProjectName: string;
    settings: Settings;
    languages: string[];
  };
};

/**
 * Builds the full adapter bundle the orchestrator's `run` entry point needs. Must be
 * called inside a Vue setup scope (Pinia stores resolve through `useStores()` /
 * `defineStore` calls). The returned bundle has no Vue dependency past construction —
 * it can be passed across `await` boundaries freely.
 */
export function buildOrchestratorAdapters(input: BuildAdaptersInput): OrchestratorAdapters {
  const directusApi = new DirectusModuleApi(useApi(), useDirectusCollectionsStore());
  const { addDirectusError } = useErrorsStore();
  const onDirectusError: ErrorSink = (e) => addDirectusError(e);

  return {
    cursorStore: buildCursorStore(),
    lockStore: buildLockStore(),
    localazyContentFetcher: buildLocalazyContentFetcher(),
    progress: buildProgressSink(),
    directusApi,
    resolveLanguageFkField: buildResolveLanguageFkField(),
    onDirectusError,
    reportDownloadAnalytics: () => {
      const ctx = input.getAnalyticsContext();
      void AnalyticsService.trackDownloadFromLocalazy(
        ExportToLocalazyCommonService.getPayloadForUploadAnalytics({
          userId: ctx.userId,
          orgId: ctx.orgId,
          localazyProject: ctx.localazyProjectName,
          settings: ctx.settings,
          languages: ctx.languages,
        }),
      );
    },
  };
}
