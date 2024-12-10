import { AppCollection } from '@directus/types';
import { isEqual, merge } from 'lodash';
import { Ref, computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useStores } from '@directus/extensions-sdk';
import { ProgressTrackerId } from '../enums/progress-tracker-id';
import { EnabledFieldsService } from '../../../common/utilities/enabled-fields-service';
import { useExportToLocalazy } from './use-export-to-localazy';
import { useImportFromLocalazy } from './use-import-from-localazy';
import { useLocalazyStore } from '../stores/localazy-store';
import { useDirectusApi } from './use-directus-api';
import { useProgressTrackerStore } from '../stores/progress-tracker-store';
import { useDirectusLanguages } from './use-directus-languages';
import { useCollectionsOrganizer } from './use-collections-organizer';
import { useDirectusLocalazyAdapter } from './use-directus-localazy-adapter';
import { useTranslatableCollections } from './use-translatable-collections';
import { useTranslationStringsContent } from './use-translation-strings-content';
import { ContentTransferSetupDatabase, EnabledField } from '../../../common/models/collections-data/content-transfer-setup';
import { Configuration } from '../models/configuration';
import { AnalyticsService } from '../../../common/services/analytics-service';
import { ExportToLocalazyCommonService } from '../../../common/services/export-to-localazy-common-service';

type UseSyncContainerActions = {
  configuration: Ref<Configuration>;
  enabledFields: Ref<EnabledField[]>;
  synchronizeTranslationStrings: Ref<boolean>;
};

type OnSaveSettingsParams = {
  notify?: boolean;
  contentTransferSetupCollection: AppCollection | null;
  contentTransferSetup: ContentTransferSetupDatabase | null;
};

type OnExportParams = {
  contentTransferSetupCollection: AppCollection | null;
  contentTransferSetup: ContentTransferSetupDatabase | null;
};

type OnImportParams = OnExportParams;

export const useSyncContainerActions = (data: UseSyncContainerActions) => {
  const { configuration, enabledFields, synchronizeTranslationStrings } = data;

  const { upsertDirectusItem } = useDirectusApi();
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

  const loading = ref(false);
  const showProgress = ref(false);

  const hasChanges = computed(() => synchronizeTranslationStrings.value !== configuration.value.content_transfer_setup.translation_strings
  || !isEqual(
    EnabledFieldsService.parseFromDatabase(configuration.value.content_transfer_setup.enabled_fields),
    enabledFields.value,
  ));

  async function onSaveSettings(payload: OnSaveSettingsParams) {
    const { contentTransferSetupCollection, contentTransferSetup, notify } = payload;
    if (!hasChanges.value) { return; }

    if (contentTransferSetupCollection && contentTransferSetup) {
      contentTransferSetup.enabled_fields = EnabledFieldsService.prepareForDatabase(enabledFields.value);
      await upsertDirectusItem(
        contentTransferSetupCollection.collection,
        contentTransferSetup,
        {
          enabled_fields: EnabledFieldsService.prepareForDatabase(enabledFields.value),
          translation_strings: synchronizeTranslationStrings.value,
        },
      );
      if (notify) {
        notificationsStore.add({
          title: 'Settings saved',
        });
      }
    }
  }

  async function onExport(payload: OnExportParams) {
    loading.value = true;
    showProgress.value = true;
    addProgressMessage({
      id: ProgressTrackerId.PREPARING_IMPORT,
      message: 'Preparing Directus data for import',
    });
    const token = computed(() => configuration.value.localazy_data.access_token);
    onSaveSettings(payload);
    try {
      const exportLanguages = await resolveExportLanguages(configuration.value.settings);
      const [translationStrings, collectionsContent] = await Promise.all([
        fetchTranslationStrings({
          languages: exportLanguages,
          settings: configuration.value.settings,
          synchronizeTranslationStrings: synchronizeTranslationStrings.value,
        }),
        fetchContentFromTranslatableCollections({
          languages: exportLanguages,
          translatableCollections: translatableCollections.value,
          enabledFields: enabledFields.value,
          settings: configuration.value.settings,
        }),
      ]);

      await useExportToLocalazy(token).exportContentToLocalazy({
        content: merge(collectionsContent, translationStrings),
        settings: configuration.value.settings,
      });
    } finally {
      loading.value = false;
    }
  }

  async function onImport(payload: OnImportParams) {
    showProgress.value = true;
    loading.value = true;
    addProgressMessage({
      id: ProgressTrackerId.RETRIEVING_LANGUAGES,
      message: 'Retrieving target languages',
    });
    onSaveSettings(payload);
    try {
      const importLanguages = await resolveImportLanguages(configuration.value.settings);
      const result = await useImportFromLocalazy().importContentFromLocalazy(
        {
          languages: importLanguages,
          localazyData: configuration.value.localazy_data,
          enabledFields: enabledFields.value,
        },
      );
      if (result.success) {
        await upsertFromLocalazyContent(result.content);
        addProgressMessage({
          id: ProgressTrackerId.IMPORT_FINISHED,
          message: 'Import finished',
        });
        AnalyticsService.trackDownloadFromLocalazy(ExportToLocalazyCommonService.getPayloadForUploadAnalytics({
          userId: localazyUser.value.id,
          orgId: localazyProject.value?.orgId || '',
          localazyProject: configuration.value.localazy_data.project_name,
          settings: configuration.value.settings,
          languages: Object.keys(importLanguages),
        }));
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
