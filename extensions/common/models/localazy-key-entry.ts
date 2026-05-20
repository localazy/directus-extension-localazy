export type Metadata = {
  add: {
    directus: {
      collection: string;
      field: string;
      itemId: number;
    };
  };
};

export type SimpleKeyValue = string | Metadata;
export type KeyValue = SimpleKeyValue | Record<string, SimpleKeyValue>;
export type KeyValueEntry = Record<string, KeyValue>;
