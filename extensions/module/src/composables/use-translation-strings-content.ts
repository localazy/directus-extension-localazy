import { TranslationStringsService } from '../../../common/services/translation-strings-service';
import { Settings } from '../../../common/models/collections-data/settings';
import { TranslatableContent } from '../../../common/models/translatable-content';
import { useErrorsStore } from '../stores/errors-store';
import { LocalazyTranslationStringBlock } from '../../../common/models/localazy-content';
import { useDirectusApi } from './use-directus-api';

type FetchTranslationStrings = {
  languages: string[];
  synchronizeTranslationStrings: boolean
  settings: Settings;
};

export const useTranslationStringsContent = () => {
  const { addDirectusError } = useErrorsStore();
  const translationStringsService = new TranslationStringsService(useDirectusApi());

  async function fetchTranslationStrings(options: FetchTranslationStrings): Promise<TranslatableContent> {
    try {
      return translationStringsService.fetchTranslationStrings(options);
    } catch (e: any) {
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
    } catch (e: any) {
      addDirectusError(e);
    }
  }

  return {
    fetchTranslationStrings,
    upsertTranslationStrings,
  };
};
