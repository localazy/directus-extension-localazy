import {
  Item, Query, Collection,
} from '@directus/types';
import { DirectusApiResultTranslationString } from '../models/translation-string';

export interface DirectusApi {
  updateDirectusItem: <T extends Item>(collection: string, itemId: number | string, data: T) => Promise<void>;
  createDirectusItem: <T extends Item>(collection: string, data: T) => Promise<void>;
  upsertDirectusItem: <T extends Item>(collection: string, item: Item & T | null, payload: T) => Promise<void>;

  fetchDirectusItems(collection: string, query: Query): Promise<Item[]>;

  getCollection(collection: string): Pick<Collection, 'collection'> | null;
  fetchSettings(): Promise<Item | null>;
  fetchTranslationStrings(): Promise<DirectusApiResultTranslationString[]>;

  upsertTranslationString<T extends Item>(payload: T): Promise<void>;
  updateSettings<T extends Item>(payload: T): Promise<void>;
}
