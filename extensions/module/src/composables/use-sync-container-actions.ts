import { isEqual } from 'lodash';
import { Ref, computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useApi } from '@directus/extensions-sdk';
import { ProgressTrackerId } from '../enums/progress-tracker-id';
import { EnabledFieldsService } from '../../../common/utilities/enabled-fields-service';
import { useExportToLocalazy } from './use-export-to-localazy';
import { useLocalazyStore } from '../stores/localazy-store';
import { useLocalazySettingsStore } from '../stores/localazy-settings-store';
import { useLocalazyConfigStore } from '../stores/localazy-config-store';
import { useLocalazyTransferSetupStore } from '../stores/localazy-transfer-setup-store';
import { useLocalazySyncLogStore } from '../stores/localazy-sync-log-store';
import { useProgressTrackerStore } from '../stores/progress-tracker-store';
import { useDirectusLanguages } from './use-directus-languages';
import { useCollectionsOrganizer } from './use-collections-organizer';
import { useTranslatableCollections } from './use-translatable-collections';
import { useTranslationStringsContent } from './use-translation-strings-content';
import { EnabledField } from '../../../common/models/collections-data/content-transfer-setup';
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
import { runIncrementalExport, SyncMode } from '../services/incremental-export-orchestrator';
import { buildExportOrchestratorAdapters } from '../services/export-orchestrator-adapters';

type UseSyncContainerActions = {
  enabledFields: Ref<EnabledField[]>;
  synchronizeTranslationStrings: Ref<boolean>;
};

export const useSyncContainerActions = (data: UseSyncContainerActions) => {
  const { enabledFields, synchronizeTranslationStrings } = data;

  const { resolveExportLanguages, resolveImportLanguages, resolveSourceLanguageName } = useDirectusLanguages();
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
  const syncLogStore = useLocalazySyncLogStore();

  const accessToken = computed(() => localazyData.value.access_token);
  const exportService = useExportToLocalazy(accessToken);

  // Resolve setup-only dependencies once here — calling `useApi()` /
  // `useStores()` from a click handler crashes with
  // "The api could not be found" / "The stores could not be found" because
  // Vue's `inject` requires an active component instance. Threading the
  // pre-resolved values into the orchestrator-adapter builders keeps both
  // orchestrators reachable from event handlers.
  const api = useApi();
  const collectionsStore = useDirectusCollectionsStore();
  const relationsStore = useDirectusRelationsStore();

  // Shared Sync-log writer for both the export and import paths. The download
  // path's adapter builder accepts the writer through its own constructor input;
  // the upload path threads it into `buildExportOrchestratorAdapters`. One
  // writer instance is fine — it's stateless beyond the per-session append-chain
  // map, and both paths target the same `localazy_sync_log` collection.
  const syncLogWriter = createSyncLogWriter({
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

  async function onExport(mode: SyncMode = 'incremental') {
    loading.value = true;
    showProgress.value = true;
    // Clear any messages left over from a prior run so the modal starts fresh. Without
    // this the tracker accumulates across syncs — `resetProgressTracker` previously only
    // ran when the user explicitly closed the modal via the Done button, and any other
    // dismissal path (re-clicking Export, switching pages) left stale messages behind.
    resetProgressTracker();

    // Pre-orchestrator progress lines. The orchestrator's first message is
    // `UPLOAD_CHANGES_SUMMARY` (or `UPLOAD_UP_TO_DATE`), which only lands once the cursor
    // has been loaded and the payload filtered — these two come before any of that. The
    // import path follows the same pattern (`SYNC_MODE_HEADER` / `RETRIEVING_LANGUAGES`).
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
      if (!localazyProject.value) {
        return;
      }

      const adapters = buildExportOrchestratorAdapters({
        contentFetcherInputs: {
          resolveExportLanguages,
          fetchTranslationStrings,
          fetchContentWithHashesByCollection,
          translatableCollections,
        },
        exportContentToLocalazy: exportService.exportContentToLocalazy,
        syncLogWriter,
        syncLogInitiator: {
          initiator: directusUserId.value,
          initiatorUser: directusUserId.value || null,
        },
      });

      const sourceLanguageName = await resolveSourceLanguageName(settings.value);

      await runIncrementalExport(adapters, {
        mode,
        settings: settings.value,
        enabledFields: enabledFields.value,
        synchronizeTranslationStrings: synchronizeTranslationStrings.value,
        localazyProject: localazyProject.value,
        sourceLanguageName,
      });
    } finally {
      loading.value = false;
      // Refresh so the "Last sync" banner + Activity page reflect this run without
      // requiring a manual reload. Fire-and-forget — don't block the user.
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
