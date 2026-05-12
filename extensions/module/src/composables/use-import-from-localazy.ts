import { storeToRefs } from 'pinia';
import { Key } from '@localazy/api-client';
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
  /**
   * Optional post-fetch filter applied per language before content parsing. The download
   * orchestrator injects cursor-based filtering here; passing it through this composable
   * keeps `use-import-from-localazy` agnostic of cursor mechanics.
   */
  filterKeysForLanguage?: (language: string, keys: Key[]) => Key[];
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
  const { addProgressMessage } = useProgressTrackerStore();
  const { addLocalazyError } = useErrorsStore();
  const { localazyProject } = storeToRefs(useLocalazyStore());

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
        filterKeysForLanguage: data.filterKeysForLanguage,
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
    } catch (e: unknown) {
      addLocalazyError(e, { type: 'import', userId: data.localazyData.user_id || '', orgId: localazyProject.value.orgId });
      return { success: false };
    }
  };

  return {
    importContentFromLocalazy,
  };
};
