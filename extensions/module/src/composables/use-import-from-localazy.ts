import { ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useLocalazyStore } from '../stores/localazy-store';
import { useProgressTrackerStore } from '../stores/progress-tracker-store';
import { ContentFromLocalazyService } from '../services/content-from-localazy-service';
import { EnabledField } from '../../../common/models/collections-data/content-transfer-setup';
import { useErrorsStore } from '../stores/errors-store';
import { ProgressTrackerId } from '../enums/progress-tracker-id';
import { DirectusLocalazyLanguage } from '../../../common/models/directus-localazy-language';
import { importFromLocalazyService } from '../services/import-from-localazy-service';
import { LocalazyData } from '../../../common/models/collections-data/localazy-data';

type ImportContentFromLocalazy = {
  languages: DirectusLocalazyLanguage[];
  enabledFields: EnabledField[];
  localazyData: LocalazyData;
};

type ImportContentFromLocalazySuccessReturn = {
  success: true;
  content: ReturnType<typeof ContentFromLocalazyService.parseLocalazyContent>;
};

type ImportContentFromLocalazyErrorReturn = {
  success: false;
};

type ImportContentFromLocalazyReturn = ImportContentFromLocalazySuccessReturn | ImportContentFromLocalazyErrorReturn;

export const useImportFromLocalazy = () => {
  const loading = ref(false);

  const { addProgressMessage } = useProgressTrackerStore();
  const { addLocalazyError } = useErrorsStore();
  const { localazyProject, localazyData } = storeToRefs(useLocalazyStore());

  const importContentFromLocalazy = async (data: ImportContentFromLocalazy): Promise<ImportContentFromLocalazyReturn> => {
    if (!localazyProject.value) {
      return { success: false };
    }
    try {
      return importFromLocalazyService.importContentFromLocalazy({
        languages: data.languages,
        enabledFields: data.enabledFields,
        localazyData: data.localazyData,
        localazyProject: localazyProject.value,
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
    } catch (e: any) {
      addLocalazyError(e, { type: 'import', userId: localazyData.value?.user_id || '', orgId: localazyProject.value.orgId });
      return { success: false };
    }
  };

  return {
    loading,
    importContentFromLocalazy,
  };
};
