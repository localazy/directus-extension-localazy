import { Item } from '@directus/types';
import { isEqual } from 'lodash';
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

type CreatePayloadForTranslationItem = {
  collectionItem: Item,
  localazyItem: LocalazyCollectionItem,
  language: string,
  currentPayload: TranslationPayload
};

type UpsertItemFromLocalazyContent = {
  collection: string;
  itemsInCollection: Item[];
  itemId: string | number;
  translations: LocalazyItemsInLanguage[];
};

export const useDirectusLocalazyAdapter = () => {
  const { addDirectusError } = useErrorsStore();
  const { upsertProgressMessage } = useProgressTrackerStore();
  const { fetchDirectusItems, updateDirectusItem } = useDirectusApi();
  const { upsertTranslationStrings } = useTranslationStringsContent();

  function createPayloadForTranslationItem(payload: CreatePayloadForTranslationItem) {
    const {
      collectionItem, localazyItem, language, currentPayload,
    } = payload;
    const translationItem = collectionItem[localazyItem.translationField]?.find(
      (data: any) => data.languages_code === language,
    );
    const common = {
      localazyItem,
      translationItem,
      language,
      languageCodeField: 'languages_code',
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
          languages_code: language,
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
      itemsInCollection, itemId, translations, collection,
    } = data;
    const collectionItem = itemsInCollection.find((i: Item) => +i.id === +itemId);
    let payload: TranslationPayload = { };
    const updateTranslationFields: Set<string> = new Set();
    let somethingToCreate = false;

    if (!collectionItem) {
      return;
    }
    translations.forEach((translation) => {
      translation.items.forEach((item) => {
        const result = createPayloadForTranslationItem({
          collectionItem,
          localazyItem: item,
          language: translation.language,
          currentPayload: payload,
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

  async function upsertItemsFromSingleCollection(collection: string, content: LocalazyCollectionBlock) {
    try {
      const itemsInCollection = await fetchDirectusItems(collection, {
        fields: ['id', ...content.translationFields.map((field) => `${field}.*`)],
        limit: -1,
      });

      Object.entries(content.items).forEach(async ([itemId, translations], index) => {
        upsertProgressMessage(ProgressTrackerId.UPDATING_DIRECTUS_COLLECTION, {
          message: `Updating ${collection} collection (${index + 1}/${Object.keys(content.items).length})`,
        });

        try {
          await upsertItemFromLocalazyContent({
            collection,
            itemsInCollection,
            itemId,
            translations,
          });
        } catch (e: any) {
          addDirectusError(e);
          upsertProgressMessage(ProgressTrackerId.UPDATING_DIRECTUS_COLLECTION_ERROR, {
            type: 'error',
            message: `Error updating ${collection} collection (${index + 1}/${Object.keys(content.items).length})`,
          });
        }
      });
    } catch (e: any) {
      addDirectusError(e);
      upsertProgressMessage(ProgressTrackerId.UPDATING_DIRECTUS_COLLECTION_ERROR, {
        type: 'error',
        message: `Error updating ${collection} collection`,
      });
    }
    return {};
  }

  async function upsertFromLocalazyContent(contentItems: LocalazyContent) {
    const { add, execute } = useEnhancedAsyncQueue();
    contentItems.collections.forEach((content, collection) => {
      add(async () => upsertItemsFromSingleCollection(collection, content));
    });
    add(async () => upsertTranslationStrings(Array.from(contentItems.translationStrings.values())));

    await execute({ delayBetween: 150 });
  }

  return {
    upsertFromLocalazyContent,
  };
};
