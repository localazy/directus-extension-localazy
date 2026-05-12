import { useApi } from '@directus/extensions-sdk';
import { TranslationStringsService } from '../../../common/services/translation-strings-service';
import { Settings } from '../../../common/models/collections-data/settings';
import { TranslatableContent } from '../../../common/models/translatable-content';
import { useErrorsStore } from '../stores/errors-store';
import { LocalazyTranslationStringBlock } from '../../../common/models/localazy-content';
import { WrittenTriple } from '../models/sync-write-result';
import { ProgressTrackerId } from '../enums/progress-tracker-id';
import { useProgressTrackerStore } from '../stores/progress-tracker-store';
import { DirectusModuleApi } from '../services/directus-module-api';
import { useDirectusCollectionsStore } from './use-directus-stores';

type FetchTranslationStrings = {
  languages: string[];
  synchronizeTranslationStrings: boolean;
  settings: Settings;
};

type UpsertTranslationStringsOptions = {
  /**
   * Invoked after the translation-string upsert resolves with the list of `(lang, keyId,
   * event)` triples that were successfully written. Mirrors the collection-content
   * adapter so the cursor sees both write paths.
   */
  onWritten?: (triples: WrittenTriple[]) => void;
};

export const useTranslationStringsContent = () => {
  const { addDirectusError } = useErrorsStore();
  const { upsertProgressMessage } = useProgressTrackerStore();
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

  /**
   * Persist incoming translation-string blocks to Directus. `data` is one entry per
   * Localazy translation-string key; each entry carries the per-language map plus the
   * source `localazyKey` (id + event) the orchestrator needs to advance the cursor.
   * PATCH-then-mark: only emit the triples after the underlying call resolves.
   */
  async function upsertTranslationStrings(data: LocalazyTranslationStringBlock[], options: UpsertTranslationStringsOptions = {}) {
    if (data.length === 0) {
      return;
    }
    upsertProgressMessage(ProgressTrackerId.UPDATING_TRANSLATION_STRINGS, {
      message: `Updating ${data.length} translation ${data.length === 1 ? 'string' : 'strings'}`,
    });
    try {
      await translationStringsService.upsertTranslationStrings(data);
      if (options.onWritten) {
        const triples: WrittenTriple[] = [];
        data.forEach((block) => {
          Object.keys(block.translations).forEach((language) => {
            triples.push({
              language,
              keyId: block.localazyKey.id,
              event: block.localazyKey.event,
            });
          });
        });
        if (triples.length > 0) {
          options.onWritten(triples);
        }
      }
    } catch (e: unknown) {
      addDirectusError(e);
    }
  }

  return {
    fetchTranslationStrings,
    upsertTranslationStrings,
  };
};
