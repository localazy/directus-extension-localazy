/* eslint-disable no-param-reassign */
import { Item } from '@directus/types';
import { uniqWith } from 'lodash';
import { TranslationPayload } from '../models/directus/translation-payload';
import { LocalazyCollectionItem } from '../../../common/models/localazy-content';

type Options = {
  localazyItem: LocalazyCollectionItem;
  translationItem?: Partial<Item>;
  language: string;
  languageCodeField: string;
  type: 'update' | 'create';
  value: Record<string, any>;
};

const areDirectusItemsEqual = (a: Item, b: Item) => a.id === b.id && a.id !== undefined;
const areCreateItemsEqual = (a: Item, b: Item, languagesCodeField: string) => a[languagesCodeField] === b[languagesCodeField];

function resolveStagedItem(payload: TranslationPayload, data: Options) {
  const {
    localazyItem, translationItem, type, language, languageCodeField,
  } = data;

  const stagedItems = payload[localazyItem.translationField]?.[type];
  if (!stagedItems) {
    return undefined;
  }

  if (type === 'create') {
    // For the given translation field, we will always create one new item at most the given language
    return stagedItems.find((d: Item) => d[languageCodeField] === language);
  }
  return stagedItems.find((d: Item) => d.id === translationItem?.id);
}

export const mergeTranslationPayload = (payload: TranslationPayload, data: Options) => {
  const {
    localazyItem, translationItem, type, value,
  } = data;
  const stagedItem = resolveStagedItem(payload, data);

  const entryItem = {
    ...(stagedItem || translationItem || {}),
    ...value,
  };
  const currentData = payload[localazyItem.translationField]?.[type] || [];

  if (type === 'create') {
    payload[localazyItem.translationField] = {
      ...(payload[localazyItem.translationField] || {}),
      create: uniqWith([
        entryItem,
        ...currentData,
      ], (a, b) => areCreateItemsEqual(a, b, data.languageCodeField)),
    };
  } else {
    payload[localazyItem.translationField] = {
      ...(payload[localazyItem.translationField] || {}),
      update: uniqWith([
        entryItem,
        ...currentData,
      ], areDirectusItemsEqual),
    };
  }

  return payload;
};
