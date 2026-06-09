import { KeyValueEntry } from './localazy-key-entry';

export type TranslatableContent = {
  sourceLanguage: KeyValueEntry;
  otherLanguages: {
    [language: string]: KeyValueEntry;
  };
};
