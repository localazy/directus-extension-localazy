import { Key } from '@localazy/api-client';

type Collection = string;
type TranslationStringKey = string;

export type LocalazyCollectionItem = {
  // Maybe not needed?
  translationField: string;
  field: string;
  value: string;
  localazyKey: Key;
};

export type LocalazyItemsInLanguage = {
  language: string;
  items: LocalazyCollectionItem[];
};

export interface LocalazyCollectionBlock {
  translationFields: string[];
  items: {
    [itemId: number]: LocalazyItemsInLanguage[];
  }
}

export type LocalazyTranslationStringBlock = {
  key: string;
  directusId: string;
  localazyKey: Key;
  translations: {
    [language: string]: string;
  }
};

export type LocalazyContent = {
  translationStrings: Map<TranslationStringKey, LocalazyTranslationStringBlock>;
  collections: Map<Collection, LocalazyCollectionBlock>;
};
