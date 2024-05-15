export type Metadata = {
  add: {
    directus: {
      collection: string;
      field: string;
      itemId: number;
    }
  }
};

export type SimpleKeyValue = string | Metadata;
export type KeyValue = SimpleKeyValue | Record<string, SimpleKeyValue>;
export type KeyValueEntry = Record<string, KeyValue>;

export type TranslationStringKeyEntry = {
  translation_string: {
    [key: string]: {
      [itemId: number]: SimpleKeyValue;
    }
  }
};

export type CollectionsKeyEntry = {
  [collection: string]: {
    [itemId: number]: {
      [translationField: string]: {
        [field: string]: SimpleKeyValue
      }
    }
  };
};
