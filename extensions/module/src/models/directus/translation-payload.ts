import { Item } from '@directus/types';

export type TranslationPayload = {
  [collection: string]: {
    update?: Item[];
    create?: Item[];
  }
};
