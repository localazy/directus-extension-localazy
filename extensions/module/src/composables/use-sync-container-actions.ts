import { isEqual, merge } from 'lodash';
import { Ref, computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useStores } from '@directus/extensions-sdk';
import { ProgressTrackerId } from '../enums/progress-tracker-id';
import { EnabledFieldsService } from '../../../common/utilities/enabled-fields-service';
import { useExportToLocalazy } from './use-export-to-localazy';
import { useImportFromLocalazy } from './use-import-from-localazy';
import { useLocalazyStore } from '../stores/localazy-store';
import { useLocalazySettingsStore } from '../stores/localazy-settings-store';
import { useLocalazyConfigStore } from '../stores/localazy-config-store';
import { useLocalazyTransferSetupStore } from '../stores/localazy-transfer-setup-store';
import { useProgressTrackerStore } from '../stores/progress-tracker-store';
import { useDirectusLanguages } from './use-directus-languages';
import { useCollectionsOrganizer } from './use-collections-organizer';
import { useDirectusLocalazyAdapter } from './use-directus-localazy-adapter';
import { useTranslatableCollections } from './use-translatable-collections';
import { useTranslationStringsContent } from './use-translation-strings-content';
import { EnabledField } from '../../../common/models/collections-data/content-transfer-setup';
import { AnalyticsService } from '../../../common/services/analytics-service';
import { ExportToLocalazyCommonService } from '../../../common/services/export-to-localazy-common-service';

type UseSyncContainerActions = {
  enabledFields: Ref<EnabledField[]>;
  synchronizeTranslationStrings: Ref<boolean>;
};

export const useSyncContainerActions = (data: UseSyncContainerActions) => {
  const { enabledFields, synchronizeTranslationStrings } = data;

  const { resolveExportLanguages, resolveImportLanguages } = useDirectusLanguages();
  const { fetchContentFromTranslatableCollections } = useTranslatableCollections();
  const { fetchTranslationStrings } = useTranslationStringsContent();
  const { translatableCollections } = useCollectionsOrganizer();
  const { upsertFromLocalazyContent } = useDirectusLocalazyAdapter();

  const { useNotificationsStore } = useStores();
  const notificationsStore = useNotificationsStore();

  const { addProgressMessage, resetProgressTracker } = useProgressTrackerStore();
  const localazyStore = useLocalazyStore();
  const { localazyUser, localazyProject } = storeToRefs(localazyStore);

  const settingsStore = useLocalazySettingsStore();
  const { data: settings } = storeToRefs(settingsStore);
  const configStore = useLocalazyConfigStore();
  const { data: localazyData } = storeToRefs(configStore);
  const transferSetupStore = useLocalazyTransferSetupStore();
  const { data: transferSetup } = storeToRefs(transferSetupStore);

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

  async function onExport() {
    loading.value = true;
    showProgress.value = true;
    addProgressMessage({
      id: ProgressTrackerId.PREPARING_IMPORT,
      message: 'Preparing Directus data for import',
    });
    const token = computed(() => localazyData.value.access_token);
    // Save settings is fire-and-forget; errors surface via the errors store inside onSaveSettings.
    void onSaveSettings();
    try {
      const exportLanguages = await resolveExportLanguages(settings.value);
      const [translationStrings, collectionsContent] = await Promise.all([
        fetchTranslationStrings({
          languages: exportLanguages,
          settings: settings.value,
          synchronizeTranslationStrings: synchronizeTranslationStrings.value,
        }),
        fetchContentFromTranslatableCollections({
          languages: exportLanguages,
          translatableCollections: translatableCollections.value,
          enabledFields: enabledFields.value,
          settings: settings.value,
        }),
      ]);

      await useExportToLocalazy(token).exportContentToLocalazy({
        content: merge(collectionsContent, translationStrings),
        settings: settings.value,
      });
    } finally {
      loading.value = false;
    }
  }

  async function onImport() {
    showProgress.value = true;
    loading.value = true;
    addProgressMessage({
      id: ProgressTrackerId.RETRIEVING_LANGUAGES,
      message: 'Retrieving target languages',
    });
    // Save settings is fire-and-forget; errors surface via the errors store inside onSaveSettings.
    void onSaveSettings();
    try {
      const importLanguages = await resolveImportLanguages(settings.value);
      const result = await useImportFromLocalazy().importContentFromLocalazy({
        languages: importLanguages,
        localazyData: localazyData.value,
        enabledFields: enabledFields.value,
      });
      if (result.success) {
        await upsertFromLocalazyContent(result.content, settings.value);
        addProgressMessage({
          id: ProgressTrackerId.IMPORT_FINISHED,
          message: 'Import finished',
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
      }
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
