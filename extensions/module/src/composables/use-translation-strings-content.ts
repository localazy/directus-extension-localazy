import { useApi } from '@directus/extensions-sdk';
import { TranslationStringsService } from '../../../common/services/translation-strings-service';
import { Settings } from '../../../common/models/collections-data/settings';
import { TranslatableContent } from '../../../common/models/translatable-content';
import { useErrorsStore } from '../stores/errors-store';
import { LocalazyTranslationStringBlock } from '../../../common/models/localazy-content';
import { DirectusModuleApi } from '../services/directus-module-api';
import { useDirectusCollectionsStore } from './use-directus-stores';

type FetchTranslationStrings = {
  languages: string[];
  synchronizeTranslationStrings: boolean;
  settings: Settings;
};

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

  async function upsertTranslationStrings(data: LocalazyTranslationStringBlock[]) {
    try {
      await translationStringsService.upsertTranslationStrings(data);
    } catch (e: unknown) {
      addDirectusError(e);
    }
  }

  return {
    fetchTranslationStrings,
    upsertTranslationStrings,
  };
};
