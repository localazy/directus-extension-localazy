import { isEqual, merge } from 'lodash';
import { Ref, computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { ProgressTrackerId } from '../enums/progress-tracker-id';
import { EnabledFieldsService } from '../../../common/utilities/enabled-fields-service';
import { useExportToLocalazy, UploadTrackedItem } from './use-export-to-localazy';
import { useImportFromLocalazy } from './use-import-from-localazy';
import { useLocalazyStore } from '../stores/localazy-store';
import { useLocalazySettingsStore } from '../stores/localazy-settings-store';
import { useLocalazyConfigStore } from '../stores/localazy-config-store';
import { useLocalazyTransferSetupStore } from '../stores/localazy-transfer-setup-store';
import { useLocalazySyncStateStore } from '../stores/localazy-sync-state-store';
import { useProgressTrackerStore } from '../stores/progress-tracker-store';
import { useDirectusLanguages } from './use-directus-languages';
import { useCollectionsOrganizer } from './use-collections-organizer';
import { useDirectusLocalazyAdapter } from './use-directus-localazy-adapter';
import { useTranslatableCollections } from './use-translatable-collections';
import { useTranslationStringsContent } from './use-translation-strings-content';
import { EnabledField } from '../../../common/models/collections-data/content-transfer-setup';
import { summarizeLocalazyContent } from '../utils/summarize-localazy-content';
import { summarizeUploadContent } from '../utils/summarize-upload-content';
import { AnalyticsService } from '../../../common/services/analytics-service';
import { ExportToLocalazyCommonService } from '../../../common/services/export-to-localazy-common-service';
import {
  createEmptyCursor,
  cursorMatchesProject,
  filterKeysByEventCursor,
  mergeCursor,
  parseCursor,
  recordCursorEntry,
  serializeCursor,
} from '../../../common/utilities/sync-cursor';
import {
  createEmptyUploadCursor,
  filterItemsByUploadCursor,
  mergeUploadCursor,
  parseUploadCursor,
  recordUploadEntry,
  serializeUploadCursor,
} from '../../../common/utilities/upload-cursor';
import { CURSOR_VERSION, SyncCursor, UploadCursor } from '../../../common/models/collections-data/sync-state';
import { TranslatableContent } from '../../../common/models/translatable-content';
import { WrittenTriple } from '../models/sync-write-result';
import { UploadedTriple } from '../models/upload-write-result';
import { useDirectusNotificationsStore } from './use-directus-stores';

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
  const { upsertFromLocalazyContent } = useDirectusLocalazyAdapter();

  const notificationsStore = useDirectusNotificationsStore();

  const { addProgressMessage, upsertProgressMessage, resetProgressTracker } = useProgressTrackerStore();
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

  const accessToken = computed(() => localazyData.value.access_token);
  const exportService = useExportToLocalazy(accessToken);

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
    try {
      const exportLanguages = await resolveExportLanguages(settings.value);

      // Load + auto-invalidate the on-disk upload cursor against the current project.
      //   - Incremental mode: use the on-disk cursor unless the project id has changed,
      //     in which case we treat it as empty (fresh project = fresh cursor).
      //   - Full Upload mode: start from an empty cursor. We do NOT wipe the persisted
      //     cursor here — merge-on-persist gives precedence to the in-memory cursor for
      //     cells we touched, and preserves disk entries for cells we didn't.
      const baseUploadCursor: UploadCursor =
        mode === 'full' || syncStateData.value.cursor_project_id !== (localazyProject.value?.id || '')
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
          message: 'All items already uploaded — nothing to push',
        });
        // Touch last_sync_at so the UX reflects the most recent successful run; merge
        // preserves the on-disk cursor verbatim.
        await persistUploadCursor(inMemoryUploadCursor);
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
      let writtenSinceStart = 0;

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
    } finally {
      loading.value = false;
    }
  }

  /**
   * Cursor save with merge-on-persist: re-read the latest on-disk cursor, take
   * `max(event)` per cell, write the result. Makes concurrent syncs benign — the loser
   * never clobbers the winner. `cursor_project_id` is bumped to the current project on
   * every save so subsequent reads correctly auto-invalidate when the user reconnects to
   * a different project.
   */
  async function persistCursor(inMemory: SyncCursor) {
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
  }

  async function onImport(mode: SyncMode = 'incremental') {
    showProgress.value = true;
    loading.value = true;
    const startedAt = Date.now();

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

      // Load + auto-invalidate the on-disk cursor against the current project.
      //   - Incremental mode: use the on-disk cursor as the filter base, unless the
      //     project id has changed (the user reconnected), in which case we treat it as
      //     empty.
      //   - Full Sync mode: start from an empty filter base. We do NOT wipe the
      //     persisted cursor here — merge-on-persist takes `max(event)` per cell, so
      //     prior entries for keys we didn't visit this run are preserved (still
      //     correct), and entries we did visit are overwritten with their new events.
      const baseCursor: SyncCursor =
        mode === 'full' || !cursorMatchesProject(syncStateData.value.cursor_project_id, localazyProject.value?.id || '')
          ? createEmptyCursor()
          : parseCursor(syncStateData.value.processed_keys);
      // The in-memory cursor tracks only what we successfully wrote this run.
      // `persistCursor` merges it with whatever's on disk before each save.
      const inMemoryCursor: SyncCursor = createEmptyCursor();

      upsertProgressMessage(ProgressTrackerId.FETCHING_TRANSLATIONS, {
        message: 'Fetching translations from Localazy...',
      });

      const result = await useImportFromLocalazy().importContentFromLocalazy({
        languages: importLanguages,
        localazyData: localazyData.value,
        enabledFields: enabledFields.value,
        filterKeysForLanguage: (language, keys) => filterKeysByEventCursor(keys, baseCursor.processed_keys[language]),
      });

      if (!result.success) {
        return;
      }

      const summary = summarizeLocalazyContent(result.content);

      if (summary.changes === 0) {
        upsertProgressMessage(ProgressTrackerId.UP_TO_DATE, {
          message: 'Already up to date — no changes since last sync',
        });
        // Still touch `last_sync_at` so the UX / debug field reflects the most recent
        // successful run; merge-on-persist keeps the cursor itself unchanged.
        await persistCursor(inMemoryCursor);
        return;
      }

      upsertProgressMessage(ProgressTrackerId.CHANGES_SUMMARY, {
        message: `Found ${summary.changes} changes across ${summary.languages} languages — applying to ${summary.items} items in ${summary.collections} collections`,
      });

      // Throttled flush: persist every `flushEvery` keys completed (capped at 10% of
      // total work, minimum 50). Final flush happens unconditionally below.
      const totalKeys = summary.changes;
      const flushEvery = Math.max(50, Math.ceil(totalKeys / 10));
      let sinceLastFlush = 0;
      let writtenSinceStart = 0;

      const onWritten = (triples: WrittenTriple[]) => {
        triples.forEach((t) => {
          recordCursorEntry(inMemoryCursor, t.language, t.keyId, t.event);
        });
        sinceLastFlush += triples.length;
        writtenSinceStart += triples.length;
        if (sinceLastFlush >= flushEvery) {
          sinceLastFlush = 0;
          // Fire-and-forget: the next persist will reload the disk cursor anyway, and we
          // do not want write progress to stall on a slow Directus PATCH.
          void persistCursor(inMemoryCursor);
        }
      };

      // Final flush — guarantees the last batch lands even if it didn't cross the
      // throttle threshold. The `finally` makes the contract literal: even if
      // `upsertFromLocalazyContent` throws midway, whatever the writers already
      // accumulated via `onWritten` still gets persisted.
      try {
        await upsertFromLocalazyContent(result.content, settings.value, { onWritten });
      } finally {
        await persistCursor(inMemoryCursor);
      }

      const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
      addProgressMessage({
        id: ProgressTrackerId.IMPORT_FINISHED,
        message: `Imported ${writtenSinceStart} changes across ${summary.languages} languages. ${summary.items} items updated in ${elapsedSec}s.`,
      });

      // Analytics is fire-and-forget; download flow shouldn't block on telemetry.
      void AnalyticsService.trackDownloadFromLocalazy(
        ExportToLocalazyCommonService.getPayloadForUploadAnalytics({
          userId: localazyUser.value.id,
          orgId: localazyProject.value?.orgId || '',
          localazyProject: localazyData.value.project_name,
          settings: settings.value,
          languages: Object.keys(importLanguages),
        }),
      );
    } finally {
      loading.value = false;
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
