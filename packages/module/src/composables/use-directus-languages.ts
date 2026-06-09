import { storeToRefs } from 'pinia';
import { useApi } from '@directus/extensions-sdk';
import { useErrorsStore } from '../stores/errors-store';
import { Settings } from '@localazy/directus-common';
import { useLocalazyStore } from '../stores/localazy-store';
import { DirectusLocalazyLanguage } from '@localazy/directus-common';
import { DirectusLanguageRow, SynchronizationLanguagesService } from '@localazy/directus-common';
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

  /**
   * Look up the human-readable name of the source language from the user's Directus
   * languages collection. Returns `null` when no name can be derived — the caller is
   * expected to fall back to the bare language code. Errors are surfaced via the errors
   * store and resolve to `null` so a log-line lookup never derails the export click.
   */
  async function resolveSourceLanguageName(settings: Settings): Promise<string | null> {
    if (!settings.source_language) return null;
    try {
      const rows = await synchronizationLanguagesService.fetchDirectusLanguageRows(
        settings.language_collection,
        settings.language_code_field,
      );
      const match = rows.find((row) => row.code === settings.source_language);
      return match?.name ?? null;
    } catch (e: unknown) {
      addDirectusError(e);
      return null;
    }
  }

  return {
    resolveExportLanguages,
    resolveImportLanguages,
    resolveSourceLanguageName,
    fetchDirectusLanguages,
    fetchDirectusLanguageRows,
  };
}
