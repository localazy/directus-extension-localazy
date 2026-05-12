import { Item } from '@directus/types';
import { isEqual } from 'lodash';
import {
  LocalazyCollectionBlock,
  LocalazyContent,
  LocalazyCollectionItem,
  LocalazyItemsInLanguage,
} from '../../../common/models/localazy-content';
import { Settings } from '../../../common/models/collections-data/settings';
import { createAsyncQueue } from '../../../common/utilities/async-queue';
import { TranslationPayload } from '../models/directus/translation-payload';
import { mergeTranslationPayload } from '../utils/merge-translation-payload';
import { useErrorsStore } from '../stores/errors-store';
import { ProgressTrackerId } from '../enums/progress-tracker-id';
import { useProgressTrackerStore } from '../stores/progress-tracker-store';
import { useDirectusApi } from './use-directus-api';
import { useDirectusRelationsStore } from './use-directus-stores';
import { useTranslationStringsContent } from './use-translation-strings-content';

type CreatePayloadForTranslationItem = {
  collectionItem: Item;
  localazyItem: LocalazyCollectionItem;
  language: string;
  currentPayload: TranslationPayload;
  languageFkField: string;
  languageCodeField: string;
};

type UpsertItemFromLocalazyContent = {
  collection: string;
  itemsInCollection: Item[];
  itemId: string | number;
  translations: LocalazyItemsInLanguage[];
  translationFieldFkMap: Map<string, string>;
  languageCodeField: string;
};

/**
 * Resolves the language code from a translation row's FK field. Directus expands
 * relations into objects, but legacy callers may pass the bare string — accept both.
 * Exported so the logic can be tested without standing up the Pinia stores.
 */
export function extractLanguageCode(fkValue: unknown, languageCodeField: string): string | undefined {
  if (typeof fkValue === 'string') {
    return fkValue;
  }
  if (fkValue && typeof fkValue === 'object') {
    const codeValue = (fkValue as Record<string, unknown>)[languageCodeField];
    return typeof codeValue === 'string' ? codeValue : undefined;
  }
  return undefined;
}

export const useDirectusLocalazyAdapter = () => {
  const { addDirectusError } = useErrorsStore();
  const { upsertProgressMessage } = useProgressTrackerStore();
  const { fetchDirectusItems, updateDirectusItem } = useDirectusApi();
  const { upsertTranslationStrings } = useTranslationStringsContent();
  const relationsStore = useDirectusRelationsStore();

  /**
   * Resolve the FK column on a translation collection that points back at the languages
   * collection. The Directus convention is `languages_code`, but real-world installs often
   * use a different name (`lang_code`, `language`, etc.) — hardcoding breaks them.
   * Falls back to `languages_code` when the relation can't be located.
   */
  function resolveLanguageFkField(parentCollection: string, translationField: string, languagesCollection: string): string {
    const relations = relationsStore.getRelationsForField(parentCollection, translationField);
    const languageRelation = relations.find((r) => r.related_collection === languagesCollection);
    return languageRelation?.field || 'languages_code';
  }

  function createPayloadForTranslationItem(payload: CreatePayloadForTranslationItem) {
    const { collectionItem, localazyItem, language, currentPayload, languageFkField, languageCodeField } = payload;
    const translationItem = collectionItem[localazyItem.translationField]?.find((data: Record<string, unknown>) => {
      const code = extractLanguageCode(data[languageFkField], languageCodeField);
      return code === language;
    });
    const common = {
      localazyItem,
      translationItem,
      language,
      languageCodeField: languageFkField,
    };
    const isCreateOperation = translationItem === undefined;

    if (translationItem) {
      mergeTranslationPayload(currentPayload, {
        ...common,
        type: 'update',
        value: {
          [localazyItem.field]: localazyItem.value,
        },
      });
    } else {
      mergeTranslationPayload(currentPayload, {
        ...common,
        type: 'create',
        value: {
          [languageFkField]: language,
          [localazyItem.field]: localazyItem.value,
        },
      });
    }
    return {
      currentPayload,
      isCreateOperation,
    };
  }

  function madeUpdateChanges(updateTranslationFields: Set<string>, payload: TranslationPayload, collectionItem: Item) {
    return (
      updateTranslationFields.size > 0 &&
      Array.from(updateTranslationFields.values()).some((field) => {
        const updatePayloadForField = payload[field]?.update || [];
        const collectionItemForField = collectionItem[field] || [];
        return updatePayloadForField.some((item) => {
          const identicalCollectionItemForFieldItem = collectionItemForField.find((i: unknown) => isEqual(i, item));
          return identicalCollectionItemForFieldItem === undefined;
        });
      })
    );
  }

  async function upsertItemFromLocalazyContent(data: UpsertItemFromLocalazyContent) {
    const { itemsInCollection, itemId, translations, collection, translationFieldFkMap, languageCodeField } = data;
    // Stringify both sides — `+id` returns NaN for UUID primary keys, and NaN === NaN is
    // false, so the strict numeric equality used previously silently failed for any
    // installation with UUID-keyed collections.
    const collectionItem = itemsInCollection.find((i: Item) => String(i.id) === String(itemId));
    let payload: TranslationPayload = {};
    const updateTranslationFields: Set<string> = new Set();
    let somethingToCreate = false;

    if (!collectionItem) {
      return;
    }
    translations.forEach((translation) => {
      translation.items.forEach((item) => {
        const languageFkField = translationFieldFkMap.get(item.translationField) || 'languages_code';
        const result = createPayloadForTranslationItem({
          collectionItem,
          localazyItem: item,
          language: translation.language,
          currentPayload: payload,
          languageFkField,
          languageCodeField,
        });
        payload = result.currentPayload;
        if (result.isCreateOperation) {
          somethingToCreate = true;
        } else {
          updateTranslationFields.add(item.translationField);
        }
      });
    });
    const someUpdateChanges = madeUpdateChanges(updateTranslationFields, payload, collectionItem);
    if (someUpdateChanges || somethingToCreate) {
      await updateDirectusItem(collection, itemId, payload);
    }
  }

  async function upsertItemsFromSingleCollection(collection: string, content: LocalazyCollectionBlock, settings: Settings) {
    try {
      // Build a map of translation field -> FK column for the language relation, and ask
      // Directus to expand each language reference (`${field}.${fk}.*`) so the FK column
      // hands us an object we can pull `language_code_field` out of.
      const translationFieldFkMap = new Map<string, string>();
      const fields: string[] = ['id'];
      content.translationFields.forEach((field) => {
        const fkField = resolveLanguageFkField(collection, field, settings.language_collection);
        translationFieldFkMap.set(field, fkField);
        fields.push(`${field}.*`);
        fields.push(`${field}.${fkField}.*`);
      });

      const itemsInCollection = await fetchDirectusItems(collection, {
        fields,
        limit: -1,
      });

      // for...of awaits each iteration. The previous forEach(async ...) was fire-and-forget,
      // so this function used to return before the upserts ran — errors went unhandled and
      // the caller's progress tracker raced ahead.
      const entries = Object.entries(content.items);
      for (let index = 0; index < entries.length; index += 1) {
        const [itemId, translations] = entries[index]!;
        upsertProgressMessage(ProgressTrackerId.UPDATING_DIRECTUS_COLLECTION, {
          message: `Updating ${collection} collection (${index + 1}/${entries.length})`,
        });

        try {
          await upsertItemFromLocalazyContent({
            collection,
            itemsInCollection,
            itemId,
            translations,
            translationFieldFkMap,
            languageCodeField: settings.language_code_field,
          });
        } catch (e: unknown) {
          addDirectusError(e);
          upsertProgressMessage(ProgressTrackerId.UPDATING_DIRECTUS_COLLECTION_ERROR, {
            type: 'error',
            message: `Error updating ${collection} collection (${index + 1}/${entries.length})`,
          });
        }
      }
    } catch (e: unknown) {
      addDirectusError(e);
      upsertProgressMessage(ProgressTrackerId.UPDATING_DIRECTUS_COLLECTION_ERROR, {
        type: 'error',
        message: `Error updating ${collection} collection`,
      });
    }
    return {};
  }

  async function upsertFromLocalazyContent(contentItems: LocalazyContent, settings: Settings) {
    const { add, execute } = createAsyncQueue();
    contentItems.collections.forEach((content, collection) => {
      add(async () => upsertItemsFromSingleCollection(collection, content, settings));
    });
    add(async () => upsertTranslationStrings(Array.from(contentItems.translationStrings.values())));

    await execute({ delayBetween: 150 });
  }

  return {
    upsertFromLocalazyContent,
  };
};
