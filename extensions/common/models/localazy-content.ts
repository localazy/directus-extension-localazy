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
  };
}

export type LocalazyTranslationStringBlock = {
  key: string;
  directusId: string;
  // Per-language Localazy Key — each language has its own (id, event) pair.
  // Required for the incremental sync cursor; collapsing into a single Key would mean
  // the cursor records the wrong-language id and never matches on the next sync.
  localazyKeys: Record<string, Key>;
  translations: {
    [language: string]: string;
  };
};

export type LocalazyContent = {
  translationStrings: Map<TranslationStringKey, LocalazyTranslationStringBlock>;
  collections: Map<Collection, LocalazyCollectionBlock>;
};
