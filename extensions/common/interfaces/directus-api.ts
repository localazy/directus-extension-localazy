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
  /**
   * Patch one non-singleton row by id. Used by the incremental-import orchestrator's
   * upsert step to write translation-collection payloads. Singletons go through
   * `createDirectusItem` (which upserts) — `updateDirectusItem` is for items with a
   * concrete id.
   */
  updateDirectusItem<T extends Item>(collection: string, itemId: number | string, data: T, options?: ItemOptions): Promise<void>;
  getCollection(collection: string): Pick<Collection, 'collection'> | null;
  fetchSettings(): Promise<Item | null>;
  fetchTranslationStrings(): Promise<DirectusApiResultTranslationString[]>;
  upsertTranslationString<T extends Item>(payload: T): Promise<void>;
  updateSettings<T extends Item>(payload: T): Promise<void>;
}
