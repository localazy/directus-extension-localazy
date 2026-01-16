import { Item, Relation } from '@directus/types';
import { isEqual } from 'lodash';
import { useStores } from '@directus/extensions-sdk';
import {
  LocalazyCollectionBlock, LocalazyContent, LocalazyCollectionItem, LocalazyItemsInLanguage,
} from '../../../common/models/localazy-content';
import { useEnhancedAsyncQueue } from './use-async-queue';
import { TranslationPayload } from '../models/directus/translation-payload';
import { mergeTranslationPayload } from '../utils/merge-translation-payload';
import { useErrorsStore } from '../stores/errors-store';
import { ProgressTrackerId } from '../enums/progress-tracker-id';
import { useProgressTrackerStore } from '../stores/progress-tracker-store';
import { useDirectusApi } from './use-directus-api';
import { useTranslationStringsContent } from './use-translation-strings-content';
import { Settings } from '../../../common/models/collections-data/settings';

type CreatePayloadForTranslationItem = {
  collectionItem: Item,
  localazyItem: LocalazyCollectionItem,
  language: string,
  currentPayload: TranslationPayload,
  languageFkField: string,
  languageCodeField: string,
};

type UpsertItemFromLocalazyContent = {
  collection: string;
  itemsInCollection: Item[];
  itemId: string | number;
  translations: LocalazyItemsInLanguage[];
  translationFieldFkMap: Map<string, string>;
  languageCodeField: string;
};

export const useDirectusLocalazyAdapter = () => {
  const { addDirectusError } = useErrorsStore();
  const { upsertProgressMessage } = useProgressTrackerStore();
  const { fetchDirectusItems, updateDirectusItem } = useDirectusApi();
  const { upsertTranslationStrings } = useTranslationStringsContent();
  const { useRelationsStore } = useStores();
  const relationsStore = useRelationsStore();

  /**
   * Get the FK field name for a translation relation that points to the languages collection.
   * Returns the field name (e.g., 'languages_code') or default if not found.
   */
  function getLanguageFkFieldName(collection: string, translationField: string, languagesCollection: string): string {
    const relations: Relation[] = relationsStore.getRelationsForField(collection, translationField);
    const languageRelation = relations.find((r) => r.related_collection === languagesCollection);
    return languageRelation?.field || 'languages_code';
  }

  /**
   * Extract language code from a languages_code field value.
   * Handles both direct string values and expanded object format.
   */
  function extractLanguageCode(languageFieldValue: unknown, languageCodeField: string = 'code'): string | undefined {
    if (typeof languageFieldValue === 'string') {
      return languageFieldValue;
    }
    if (languageFieldValue && typeof languageFieldValue === 'object') {
      return (languageFieldValue as Record<string, unknown>)[languageCodeField] as string;
    }
    return undefined;
  }

  function createPayloadForTranslationItem(payload: CreatePayloadForTranslationItem) {
    const {
      collectionItem, localazyItem, language, currentPayload, languageFkField, languageCodeField,
    } = payload;
    // Handle both expanded object and direct string value for the language FK field
    const translationItem = collectionItem[localazyItem.translationField]?.find(
      (data: any) => {
        const langCode = extractLanguageCode(data[languageFkField], languageCodeField);
        return langCode === language;
      },
    );
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
    return updateTranslationFields.size > 0 && Array.from(updateTranslationFields.values())
      .some((field) => {
        const updatePayloadForField = payload[field]?.update || [];
        const collectionItemForField = collectionItem[field] || [];
        return updatePayloadForField.some((item) => {
          const identicalCollectionItemForFieldItem = collectionItemForField.find((i: any) => isEqual(i, item));
          return identicalCollectionItemForFieldItem === undefined;
        });
      });
  }

  async function upsertItemFromLocalazyContent(data: UpsertItemFromLocalazyContent) {
    const {
      itemsInCollection, itemId, translations, collection, translationFieldFkMap, languageCodeField,
    } = data;
    // Compare as strings to handle both numeric IDs and UUIDs
    const collectionItem = itemsInCollection.find((i: Item) => String(i.id) === String(itemId));
    let payload: TranslationPayload = { };
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
      // Build a map of translation field -> FK field name for language relation
      const translationFieldFkMap = new Map<string, string>();
      const fields = ['id'];

      content.translationFields.forEach((field) => {
        // Resolve the FK field name for this translation relation
        const fkField = getLanguageFkFieldName(collection, field, settings.language_collection);
        translationFieldFkMap.set(field, fkField);

        fields.push(`${field}.*`);
        fields.push(`${field}.${fkField}.*`); // Expand language relation dynamically
      });

      const itemsInCollection = await fetchDirectusItems(collection, {
        fields,
        limit: -1,
      });

      // Use for...of instead of forEach to properly await async operations
      const entries = Object.entries(content.items);
      for (let index = 0; index < entries.length; index += 1) {
        const [itemId, translations] = entries[index];
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
        } catch (e: any) {
          addDirectusError(e);
          upsertProgressMessage(ProgressTrackerId.UPDATING_DIRECTUS_COLLECTION_ERROR, {
            type: 'error',
            message: `Error updating ${collection} collection (${index + 1}/${entries.length})`,
          });
        }
      }
    } catch (e: any) {
      addDirectusError(e);
      upsertProgressMessage(ProgressTrackerId.UPDATING_DIRECTUS_COLLECTION_ERROR, {
        type: 'error',
        message: `Error updating ${collection} collection`,
      });
    }
    return {};
  }

  async function upsertFromLocalazyContent(contentItems: LocalazyContent, settings: Settings) {
    const { add, execute } = useEnhancedAsyncQueue();
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
