import { Item, Query, Collection } from '@directus/types';
import { DirectusApiResultTranslationString } from '../models/translation-string';

export type ItemOptions = {
  /** Remove empty values from the payload */
  ignoreEmpty?: boolean;
};

/**
 * Contract the common service classes use to talk to Directus. Both the hook
 * (`DirectusApiService`, built around `ItemsService`) and the module
 * (`DirectusModuleApi`, built around `useApi()`) implement this so the same
 * service classes work on both sides.
 *
 * Only the methods the common services actually call are declared here —
 * historical members like `updateDirectusItem`, `upsertDirectusItem`,
 * `fetchDirectusSingletonItem`, and `createField` were dropped. Module-side
 * helpers that aren't shared with services live on `DirectusModuleApi`
 * directly without being part of the interface.
 */
export interface DirectusApi {
  fetchDirectusItems<T extends Item>(collection: string, query?: Query): Promise<T[]>;
  createDirectusItem<T extends Item>(collection: string, data: T, options?: ItemOptions): Promise<void>;
  getCollection(collection: string): Pick<Collection, 'collection'> | null;
  fetchSettings(): Promise<Item | null>;
  fetchTranslationStrings(): Promise<DirectusApiResultTranslationString[]>;
  upsertTranslationString<T extends Item>(payload: T): Promise<void>;
  updateSettings<T extends Item>(payload: T): Promise<void>;
}
