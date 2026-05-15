import { storeToRefs } from 'pinia';
import { useApi } from '@directus/extensions-sdk';
import { useErrorsStore } from '../stores/errors-store';
import { Settings } from '../../../common/models/collections-data/settings';
import { useLocalazyStore } from '../stores/localazy-store';
import { DirectusLocalazyLanguage } from '../../../common/models/directus-localazy-language';
import { DirectusLanguageRow, SynchronizationLanguagesService } from '../../../common/services/synchronization-languages-service';
import { DirectusModuleApi } from '../services/directus-module-api';
import { useDirectusCollectionsStore } from './use-directus-stores';

export function useDirectusLanguages() {
  const { addDirectusError } = useErrorsStore();
  const { localazyProject } = storeToRefs(useLocalazyStore());
  const directusApi = new DirectusModuleApi(useApi(), useDirectusCollectionsStore());
  const synchronizationLanguagesService = new SynchronizationLanguagesService(directusApi);

  async function fetchDirectusLanguages(languageCollection: string, languageCodeField: string): Promise<string[]> {
    try {
      return synchronizationLanguagesService.fetchDirectusLanguages(languageCollection, languageCodeField);
    } catch (e: unknown) {
      addDirectusError(e);
      return [];
    }
  }

  async function fetchDirectusLanguageRows(languageCollection: string, languageCodeField: string): Promise<DirectusLanguageRow[]> {
    try {
      return synchronizationLanguagesService.fetchDirectusLanguageRows(languageCollection, languageCodeField);
    } catch (e: unknown) {
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
    } catch (e: unknown) {
      addDirectusError(e);
      return [];
    }
  }

  async function resolveExportLanguages(settings: Settings) {
    try {
      return synchronizationLanguagesService.resolveExportLanguages(settings);
    } catch (e: unknown) {
      addDirectusError(e);
      return [];
    }
  }

  return {
    resolveExportLanguages,
    resolveImportLanguages,
    fetchDirectusLanguages,
    fetchDirectusLanguageRows,
  };
}
