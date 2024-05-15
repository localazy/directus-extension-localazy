import { KeyValueEntry, TranslationStringKeyEntry, CollectionsKeyEntry } from './localazy-key-entry';

export type CollectionsTranslatableContent = {
  sourceLanguage: CollectionsKeyEntry;
  otherLanguages: {
    [language: string]: CollectionsKeyEntry;
  }
};

export type TranslationStringsTranslatableContent = {
  sourceLanguage: TranslationStringKeyEntry;
  otherLanguages: {
    [language: string]: TranslationStringKeyEntry;
  }
};

export type TranslatableContent = {
  sourceLanguage: KeyValueEntry;
  otherLanguages: {
    [language: string]: KeyValueEntry;
  }
};
