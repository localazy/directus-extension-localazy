import { useApi } from '@directus/extensions-sdk';
import { TranslationStringsService } from '@localazy/directus-common';
import { Settings } from '@localazy/directus-common';
import { TranslatableContent } from '@localazy/directus-common';
import { useErrorsStore } from '../stores/errors-store';
import { DirectusModuleApi } from '../services/directus-module-api';
import { useDirectusCollectionsStore } from './use-directus-stores';

type FetchTranslationStrings = {
  languages: string[];
  synchronizeTranslationStrings: boolean;
  settings: Settings;
};

/**
 * Module-side wrapper around translation-string fetch — the only piece still consumed by
 * the upload flow (`onExport`). The download-flow upsert moved to
 * `extensions/common/services/orchestrator/upsert-localazy-content.ts` so the same logic
 * runs from the future server-side import path.
 */
export const useTranslationStringsContent = () => {
  const { addDirectusError } = useErrorsStore();
  const directusApi = new DirectusModuleApi(useApi(), useDirectusCollectionsStore());
  const translationStringsService = new TranslationStringsService(directusApi);

  async function fetchTranslationStrings(options: FetchTranslationStrings): Promise<TranslatableContent> {
    try {
      return translationStringsService.fetchTranslationStrings(options);
    } catch (e: unknown) {
      addDirectusError(e);
      return {
        sourceLanguage: {},
        otherLanguages: {},
      };
    }
  }

  return {
    fetchTranslationStrings,
  };
};
