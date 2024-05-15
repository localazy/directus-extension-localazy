import { storeToRefs } from 'pinia';
import { useDirectusApi } from './use-directus-api';
import { useErrorsStore } from '../stores/errors-store';
import { Settings } from '../../../common/models/collections-data/settings';
import { useLocalazyStore } from '../stores/localazy-store';
import { DirectusLocalazyLanguage } from '../../../common/models/directus-localazy-language';
import { SynchronizationLanguagesService } from '../../../common/services/synchronization-languages-service';

export function useDirectusLanguages() {
  const { addDirectusError } = useErrorsStore();
  const { localazyProject } = storeToRefs(useLocalazyStore());
  const synchronizationLanguagesService = new SynchronizationLanguagesService(useDirectusApi());

  async function fetchDirectusLanguages(languageCollection: string, languageCodeField: string): Promise<string[]> {
    try {
      return synchronizationLanguagesService.fetchDirectusLanguages(languageCollection, languageCodeField);
    } catch (e: any) {
      addDirectusError(e);
      return [];
    }
  }

  async function resolveImportLanguages(settings: Settings): Promise<DirectusLocalazyLanguage[]> {
    if (!localazyProject.value) {
      return [];
    }

    try {
      return synchronizationLanguagesService.resolveImportLanguages(settings, localazyProject.value);
    } catch (e: any) {
      addDirectusError(e);
      return [];
    }
  }

  async function resolveExportLanguages(settings: Settings) {
    try {
      return synchronizationLanguagesService.resolveExportLanguages(settings);
    } catch (e: any) {
      addDirectusError(e);
      return [];
    }
  }

  return {
    resolveExportLanguages,
    resolveImportLanguages,
    fetchDirectusLanguages,
  };
}
