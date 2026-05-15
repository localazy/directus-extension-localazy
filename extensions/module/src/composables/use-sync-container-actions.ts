import { isEqual, merge } from 'lodash';
import { Ref, computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useApi } from '@directus/extensions-sdk';
import { ProgressTrackerId } from '../enums/progress-tracker-id';
import { EnabledFieldsService } from '../../../common/utilities/enabled-fields-service';
import { useExportToLocalazy, UploadTrackedItem } from './use-export-to-localazy';
import { useLocalazyStore } from '../stores/localazy-store';
import { useLocalazySettingsStore } from '../stores/localazy-settings-store';
import { useLocalazyConfigStore } from '../stores/localazy-config-store';
import { useLocalazyTransferSetupStore } from '../stores/localazy-transfer-setup-store';
import { useLocalazySyncStateStore } from '../stores/localazy-sync-state-store';
import { useLocalazySyncLogStore } from '../stores/localazy-sync-log-store';
import { useProgressTrackerStore } from '../stores/progress-tracker-store';
import { useDirectusLanguages } from './use-directus-languages';
import { useCollectionsOrganizer } from './use-collections-organizer';
import { useTranslatableCollections } from './use-translatable-collections';
import { useTranslationStringsContent } from './use-translation-strings-content';
import { EnabledField } from '../../../common/models/collections-data/content-transfer-setup';
import { summarizeUploadContent } from '../utils/summarize-upload-content';
import { cursorMatchesProject } from '../../../common/utilities/sync-cursor';
import {
  createEmptyUploadCursor,
  filterItemsByUploadCursor,
  mergeUploadCursor,
  parseUploadCursor,
  recordUploadEntry,
  serializeUploadCursor,
} from '../../../common/utilities/upload-cursor';
import { CURSOR_VERSION, UploadCursor } from '../../../common/models/collections-data/sync-state';
import { TranslatableContent } from '../../../common/models/translatable-content';
import { UploadedTriple } from '../models/upload-write-result';
import {
  useDirectusCollectionsStore,
  useDirectusNotificationsStore,
  useDirectusRelationsStore,
  useDirectusUserStore,
} from './use-directus-stores';
import { buildOrchestratorAdapters } from '../services/orchestrator-adapters';
import { createSyncLogWriter, type SyncLogHttpClient } from '../services/sync-log-writer';
import { LOCALAZY_COLLECTIONS } from '../stores/localazy-installer-store';
import { runIncrementalImport } from '../../../common/services/orchestrator/incremental-import-orchestrator';

/**
 * Mirrors the orchestrator's terminal-status string for the sync-log row. Free-string
 * column on disk; this union narrows the producer side so a typo in `onExport` can't
 * write an unrecognised status that the Activity page's `<status-label>` doesn't know
 * how to colour.
 */
type SyncLogStatus = 'completed' | 'failed' | 'skipped';

type SyncMode = 'incremental' | 'full';

type UseSyncContainerActions = {
  enabledFields: Ref<EnabledField[]>;
  synchronizeTranslationStrings: Ref<boolean>;
};

export const useSyncContainerActions = (data: UseSyncContainerActions) => {
  const { enabledFields, synchronizeTranslationStrings } = data;

  const { resolveExportLanguages, resolveImportLanguages } = useDirectusLanguages();
  const { fetchContentWithHashesByCollection } = useTranslatableCollections();
  const { fetchTranslationStrings } = useTranslationStringsContent();
  const { translatableCollections } = useCollectionsOrganizer();

  const notificationsStore = useDirectusNotificationsStore();
  const userStore = useDirectusUserStore();
  const directusUserId = computed(() => userStore.currentUser?.id ?? '');

  const { addProgressMessage, resetProgressTracker } = useProgressTrackerStore();
  const localazyStore = useLocalazyStore();
  const { localazyUser, localazyProject } = storeToRefs(localazyStore);

  const settingsStore = useLocalazySettingsStore();
  const { data: settings } = storeToRefs(settingsStore);
  const configStore = useLocalazyConfigStore();
  const { data: localazyData } = storeToRefs(configStore);
  const transferSetupStore = useLocalazyTransferSetupStore();
  const { data: transferSetup } = storeToRefs(transferSetupStore);
  const syncStateStore = useLocalazySyncStateStore();
  const { data: syncStateData } = storeToRefs(syncStateStore);
  const syncLogStore = useLocalazySyncLogStore();

  const accessToken = computed(() => localazyData.value.access_token);
  const exportService = useExportToLocalazy(accessToken);

  // Resolve setup-only dependencies once here — calling `useApi()` /
  // `useStores()` from the click handler (`onImport`) crashes with
  // "The api could not be found" / "The stores could not be found" because
  // Vue's `inject` requires an active component instance. Threading the
  // pre-resolved values into `buildOrchestratorAdapters` keeps the orchestrator
  // bundle (and its `syncLogWriter`) reachable from event handlers.
  const api = useApi();
  const collectionsStore = useDirectusCollectionsStore();
  const relationsStore = useDirectusRelationsStore();

  // The download path uses its own writer (built inside `buildOrchestratorAdapters`).
  // The upload path doesn't go through the orchestrator, so we instantiate a separate
  // writer here against the same axios client — both paths target the same
  // `localazy_sync_log` collection and the writer is stateless beyond its per-session
  // append-chain map.
  const uploadSyncLogWriter = createSyncLogWriter({
    api: api as unknown as SyncLogHttpClient,
    collectionName: LOCALAZY_COLLECTIONS.syncLog,
  });

  const loading = ref(false);
  const showProgress = ref(false);

  const hasChanges = computed(
    () =>
      synchronizeTranslationStrings.value !== transferSetup.value.translation_strings ||
      !isEqual(EnabledFieldsService.parseFromDatabase(transferSetup.value.enabled_fields), enabledFields.value),
  );

  async function onSaveSettings({ notify = false }: { notify?: boolean } = {}) {
    if (!hasChanges.value) {
      return;
    }
    await transferSetupStore.save({
      enabled_fields: EnabledFieldsService.prepareForDatabase(enabledFields.value),
      translation_strings: synchronizeTranslationStrings.value,
    });
    if (notify) {
      notificationsStore.add({ title: 'Settings saved' });
    }
  }

  /**
   * Upload-cursor save with merge-on-persist: re-read the latest on-disk cursor, take the
   * just-completed run's hashes as truth, write the result. Makes concurrent syncs benign
   * — the loser never clobbers the winner. `cursor_project_id` is bumped to the current
   * project on every save so subsequent reads correctly auto-invalidate when the user
   * reconnects to a different project.
   *
   * The merge prefers the in-memory cursor on overlapping cells: the in-memory hash
   * reflects what we *just* pushed, so it supersedes any stale on-disk hash. Cells we
   * didn't touch this run are preserved from disk.
   */
  async function persistUploadCursor(inMemory: UploadCursor) {
    try {
      await syncStateStore.reload();
      const onDisk = parseUploadCursor(syncStateData.value.uploaded_hashes);
      const merged = mergeUploadCursor(onDisk, inMemory);
      await syncStateStore.save({
        uploaded_hashes: serializeUploadCursor(merged),
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
  }

  async function onExport(mode: SyncMode = 'incremental') {
    loading.value = true;
    showProgress.value = true;
    // Clear any messages left over from a prior run so the modal starts fresh. Without
    // this the tracker accumulates across syncs — `resetProgressTracker` previously only
    // ran when the user explicitly closed the modal via the Done button, and any other
    // dismissal path (re-clicking Export, switching pages) left stale messages behind.
    resetProgressTracker();
    const startedAt = Date.now();

    addProgressMessage({
      id: ProgressTrackerId.UPLOAD_MODE_HEADER,
      message: mode === 'full' ? 'Full upload — re-pushing everything' : 'Incremental upload',
    });
    addProgressMessage({
      id: ProgressTrackerId.PREPARING_EXPORT,
      message: 'Preparing items for upload...',
    });
    // Save settings is fire-and-forget; errors surface via the errors store inside onSaveSettings.
    void onSaveSettings();

    // Open a sync-log session up-front so the run shows on the Activity page even if
    // the body throws halfway through. `startSession` is best-effort — a failure here
    // falls back to no logging for this run, the upload itself still proceeds. The
    // finalise step in `finally` is gated on `sessionId !== null`.
    let sessionId: string | null = null;
    try {
      sessionId = await uploadSyncLogWriter.startSession({
        eventType: mode === 'full' ? 'upload-full' : 'upload-incremental',
        initiator: directusUserId.value,
        initiatorUser: directusUserId.value || null,
      });
    } catch {
      // Swallow — see comment above. The Activity page just won't show this run.
    }

    // Mutated by `onWritten` deep inside the export body and the various exit paths
    // below; declared here so the `finally` block can read both. `runError` mirrors the
    // orchestrator's pattern — capture, finalise the log, then re-throw.
    let writtenSinceStart = 0;
    let runError: unknown = null;
    let logStatus: SyncLogStatus = 'completed';
    let logSummary = '';
    try {
      const exportLanguages = await resolveExportLanguages(settings.value);

      // Load + auto-invalidate the on-disk upload cursor against the current project.
      //   - Incremental mode: use the on-disk cursor unless the project id has changed,
      //     in which case we treat it as empty (fresh project = fresh cursor).
      //   - Full Upload mode: start from an empty cursor. We do NOT wipe the persisted
      //     cursor here — merge-on-persist gives precedence to the in-memory cursor for
      //     cells we touched, and preserves disk entries for cells we didn't.
      const baseUploadCursor: UploadCursor =
        mode === 'full' || !cursorMatchesProject(syncStateData.value.cursor_project_id, localazyProject.value?.id || '')
          ? createEmptyUploadCursor()
          : parseUploadCursor(syncStateData.value.uploaded_hashes);
      // Tracks only what we successfully pushed in this run. Merged with on-disk on flush.
      const inMemoryUploadCursor: UploadCursor = createEmptyUploadCursor();

      // Fetch translation strings (always full re-push) + per-item-hashed collection content in parallel.
      const [translationStrings, perCollectionWithHashes] = await Promise.all([
        fetchTranslationStrings({
          languages: exportLanguages,
          settings: settings.value,
          synchronizeTranslationStrings: synchronizeTranslationStrings.value,
        }),
        fetchContentWithHashesByCollection({
          languages: exportLanguages,
          translatableCollections: translatableCollections.value,
          enabledFields: enabledFields.value,
          settings: settings.value,
        }),
      ]);

      // Filter each collection's items against the upload cursor. Translation strings
      // bypass cursor logic entirely (decision 2 — they always full re-push).
      const trackedItems = new Map<string, UploadTrackedItem[]>();
      const collectionsContent: TranslatableContent = { sourceLanguage: {}, otherLanguages: {} };

      perCollectionWithHashes.forEach(({ collection, items }) => {
        const filteredItems = filterItemsByUploadCursor(collection, items, baseUploadCursor);
        if (filteredItems.length === 0) return;
        trackedItems.set(
          collection,
          filteredItems.map((it) => ({ id: it.id, hash: it.hash })),
        );
        filteredItems.forEach((it) => {
          merge(collectionsContent, it.content);
        });
      });

      const mergedContent: TranslatableContent = merge(collectionsContent, translationStrings);
      const summary = summarizeUploadContent(mergedContent);

      // Total tracked items across collections (drives the cursor-throttle math).
      let totalTrackedItems = 0;
      trackedItems.forEach((items) => {
        totalTrackedItems += items.length;
      });

      // Short-circuit when there's nothing to push AND no translation strings to refresh.
      if (totalTrackedItems === 0 && summary.sourceLangEntries === 0 && summary.translationEntries === 0) {
        addProgressMessage({
          id: ProgressTrackerId.UPLOAD_UP_TO_DATE,
          message: 'Already up to date — no items have changed since the last upload',
        });
        // Touch last_sync_at so the UX reflects the most recent successful run; merge
        // preserves the on-disk cursor verbatim.
        await persistUploadCursor(inMemoryUploadCursor);
        logStatus = 'skipped';
        logSummary = 'Already up to date — no items have changed since the last upload';
        return;
      }

      addProgressMessage({
        id: ProgressTrackerId.UPLOAD_CHANGES_SUMMARY,
        message: `Found ${summary.items} changed ${summary.items === 1 ? 'item' : 'items'} across ${summary.collections} ${summary.collections === 1 ? 'collection' : 'collections'} — pushing ${summary.sourceLangEntries} source-lang + ${summary.translationEntries} translation entries`,
      });

      // Throttled flush: persist every `flushEvery` items completed (capped at 10% of
      // total work, minimum 50). Final flush in `finally` is unconditional.
      const flushEvery = Math.max(50, Math.ceil(totalTrackedItems / 10));
      let sinceLastFlush = 0;

      const onWritten = (uploads: UploadedTriple[]) => {
        uploads.forEach((u) => {
          recordUploadEntry(inMemoryUploadCursor, u.collection, u.itemId, u.hash);
        });
        sinceLastFlush += uploads.length;
        writtenSinceStart += uploads.length;
        if (sinceLastFlush >= flushEvery) {
          sinceLastFlush = 0;
          // Fire-and-forget: the next persist will reload the disk cursor anyway, and we
          // do not want upload progress to stall on a slow Directus PATCH.
          void persistUploadCursor(inMemoryUploadCursor);
        }
      };

      // Final flush — guarantees the last batch lands even if it didn't cross the
      // throttle threshold. The `finally` makes the contract literal: even if the export
      // throws midway, whatever the writer already accumulated via `onWritten` still
      // gets persisted.
      try {
        await exportService.exportContentToLocalazy({
          content: mergedContent,
          settings: settings.value,
          trackedItems,
          onWritten,
        });
      } finally {
        await persistUploadCursor(inMemoryUploadCursor);
      }

      const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
      // `writtenSinceStart` counts only collection-content items successfully marked via
      // the cursor — translation strings always full-re-push and aren't tracked. When
      // only translation strings flow through, that counter stays at 0 even though work
      // happened; the generic "Upload completed" message reflects that case honestly
      // without claiming a count we can't verify.
      const finalMessage =
        writtenSinceStart > 0
          ? `Uploaded ${writtenSinceStart} ${writtenSinceStart === 1 ? 'item' : 'items'} in ${elapsedSec}s.`
          : `Upload completed in ${elapsedSec}s.`;
      addProgressMessage({
        id: ProgressTrackerId.UPLOAD_FINISHED,
        message: finalMessage,
      });
      logSummary = finalMessage;
    } catch (err) {
      runError = err;
      throw err;
    } finally {
      loading.value = false;

      // Finalise the sync-log row even on throw. Status precedence: an explicit
      // `skipped` set in the up-to-date short-circuit wins; otherwise an unhandled
      // throw flips to `failed`; otherwise the default `completed` stands.
      if (sessionId) {
        try {
          let status: SyncLogStatus = logStatus;
          let summary = logSummary;
          if (runError) {
            status = 'failed';
            summary = `Upload failed: ${runError instanceof Error ? runError.message : String(runError)}`;
          }
          await uploadSyncLogWriter.finish(sessionId, {
            status,
            summary,
            itemsProcessed: writtenSinceStart,
          });
        } catch {
          // Swallow — a left-in-progress row is fine for the Activity page; the next
          // run's trim cycle cleans it up. The user-facing outcome (toast, banner) is
          // already driven by the progress tracker, not the log row.
        }
      }
      // Refresh so the "Last sync" banner + Activity page reflect this run without
      // requiring a manual reload.
      void syncLogStore.reload();
    }
  }

  async function onImport(mode: SyncMode = 'incremental') {
    showProgress.value = true;
    loading.value = true;
    // See the matching call in `onExport` — without this the tracker accumulates
    // messages across runs whenever the user dismisses the modal without clicking Done.
    resetProgressTracker();

    // SYNC_MODE_HEADER and RETRIEVING_LANGUAGES go to the modal *before* the orchestrator
    // runs — same order users have always seen. The orchestrator (called once languages
    // are resolved) takes over from FETCHING_TRANSLATIONS onward.
    addProgressMessage({
      id: ProgressTrackerId.SYNC_MODE_HEADER,
      message: mode === 'full' ? 'Full sync — rebuilding from scratch' : 'Incremental sync',
    });
    addProgressMessage({
      id: ProgressTrackerId.RETRIEVING_LANGUAGES,
      message: 'Retrieving target languages',
    });
    // Save settings is fire-and-forget; errors surface via the errors store inside onSaveSettings.
    void onSaveSettings();
    try {
      const importLanguages = await resolveImportLanguages(settings.value);
      if (!localazyProject.value) {
        return;
      }

      const adapters = buildOrchestratorAdapters({
        api,
        collectionsStore,
        relationsStore,
        getAnalyticsContext: () => ({
          userId: localazyUser.value.id,
          orgId: localazyProject.value?.orgId || '',
          localazyProjectName: localazyData.value.project_name,
          settings: settings.value,
          languages: importLanguages.map((lang) => lang.directusForm),
        }),
        // UI-triggered runs: the initiator is the current Directus user. The
        // `initiatorUser` m2o column points at the same id, kept for forward
        // compatibility with a future name-resolution lookup. The Activity UI
        // currently renders the separate `initiator` string column; `initiator_user`
        // is stored but not yet read by the UI.
        syncLogInitiator: {
          initiator: directusUserId.value,
          initiatorUser: directusUserId.value || null,
        },
      });

      const result = await runIncrementalImport(adapters, {
        mode,
        languages: importLanguages,
        enabledFields: enabledFields.value,
        localazyData: localazyData.value,
        localazyProject: localazyProject.value,
        settings: settings.value,
        initiator: mode === 'full' ? 'ui-full' : 'ui-incremental',
      });
      // When the advisory lock was held by another run, the orchestrator returns
      // `skipped` without emitting any progress messages. The disabled Import button
      // is the primary signal, but a contender that managed to click anyway (e.g.
      // mid-poll) deserves explicit feedback — surface it as a Directus toast.
      if (result.status === 'skipped') {
        notificationsStore.add({ title: 'Sync already in progress — try again in a moment' });
        // Close the empty progress modal so the user isn't staring at a blank panel.
        showProgress.value = false;
      }
    } finally {
      loading.value = false;
      // Refresh the log store so the Sync page's "Last sync" banner reflects whatever
      // the orchestrator just did — completed, failed, or skipped. The orchestrator's
      // own `finally` writes a session row even on throw, so this is the path where
      // banner refresh matters most. Fire-and-forget — don't block the user.
      void syncLogStore.reload();
    }
  }

  function onFinishAction() {
    showProgress.value = false;
    resetProgressTracker();
  }

  return {
    onSaveSettings,
    onExport,
    onImport,
    onFinishAction,
    hasChanges,
    loading,
    showProgress,
  };
};
