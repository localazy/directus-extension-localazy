import {
  Item, Query, Collection,
  Field,
  DeepPartial,
} from '@directus/types';
import { DirectusApiResultTranslationString } from '../models/translation-string';

export type ItemOptions = {
  /** Remove empty values from the payload */
  ignoreEmpty?: boolean;
};

export interface DirectusApi {
  updateDirectusItem: <T extends Item>(collection: string, itemId: number | string, data: T, options?: ItemOptions) => Promise<void>;
  createDirectusItem: <T extends Item>(collection: string, data: T, options?: ItemOptions) => Promise<void>;
  upsertDirectusItem: <T extends Item>(ccollection: string, item: Item & T | null, payload: T, options?: ItemOptions)
  => Promise<void>;

  fetchDirectusItems<T extends Item>(collection: string, query?: Query): Promise<T[]>;
  fetchDirectusSingletonItem<T extends Item>(collection: string, query?: Query): Promise<T>;

  createField(collection: string, field: DeepPartial<Field>): Promise<void>;

  getCollection(collection: string): Pick<Collection, 'collection'> | null;
  fetchSettings(): Promise<Item | null>;
  fetchTranslationStrings(): Promise<DirectusApiResultTranslationString[]>;

  upsertTranslationString<T extends Item>(payload: T): Promise<void>;
  updateSettings<T extends Item>(payload: T): Promise<void>;
}
