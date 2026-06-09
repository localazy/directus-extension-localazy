import { useApi } from '@directus/extensions-sdk';
import type { Collection, Item, Query } from '@directus/types';
import { isEmpty } from 'lodash';
import { DirectusApi, ItemOptions } from '@localazy/directus-common';
import { DirectusApiResultTranslationString } from '@localazy/directus-common';
import { useDirectusCollectionsStore } from '../composables/use-directus-stores';

type DirectusApiAxios = ReturnType<typeof useApi>;
type CollectionsStore = ReturnType<typeof useDirectusCollectionsStore>;

/**
 * Module-side implementation of the `DirectusApi` contract — what the common
 * service classes consume. Mirrors the hook's `DirectusApiService` in shape so
 * the same services work in both contexts.
 *
 * Construction: `new DirectusModuleApi(useApi(), useDirectusCollectionsStore())`.
 * Both helpers are Vue composables, so the constructor must run inside a setup
 * scope. The instance itself is plain and can be passed around freely after that.
 */
export class DirectusModuleApi implements DirectusApi {
  protected api: DirectusApiAxios;

  protected collectionsStore: CollectionsStore;

  constructor(api: DirectusApiAxios, collectionsStore: CollectionsStore) {
    this.api = api;
    this.collectionsStore = collectionsStore;
  }

  async createDirectusItem<T extends Item>(collection: string, data: T, options: ItemOptions = {}): Promise<void> {
    const payload = this.applyOptions(data, options);
    if (isEmpty(payload)) return;

    const isSingleton = this.isSingleton(collection);
    if (isSingleton) {
      // PATCH on `/items/{collection}` upserts the singleton row with id: 1 when none exists.
      await this.api.patch(`/items/${collection}`, { ...payload, id: payload.id || 1 });
      return;
    }
    const { id: _id, ...rest } = payload as Item;
    await this.api.post(`/items/${collection}`, rest);
  }

  async updateDirectusItem<T extends Item>(collection: string, itemId: number | string, data: T, options: ItemOptions = {}): Promise<void> {
    const payload = this.applyOptions(data, options);
    if (isEmpty(payload)) return;
    if (this.isSingleton(collection)) {
      await this.api.patch(`/items/${collection}`, payload);
      return;
    }
    await this.api.patch(`/items/${collection}/${itemId}`, payload);
  }

  async fetchDirectusItems<T extends Item>(collection: string, query: Query = {}): Promise<T[]> {
    const result = await this.api.get<{ data: T[] }>(`/items/${collection}`, { params: query });
    return result.data.data;
  }

  async fetchSettings(): Promise<Item | null> {
    const result = await this.api.get<{ data: Item }>('settings', {
      params: { fields: ['translation_strings'], limit: -1 },
    });
    return result.data.data ?? null;
  }

  async fetchTranslationStrings(): Promise<DirectusApiResultTranslationString[]> {
    const result = await this.api.get<{ data: DirectusApiResultTranslationString[] }>('translations', {
      params: { limit: -1 },
    });
    return result.data.data;
  }

  async updateSettings<T extends Item>(payload: T): Promise<void> {
    await this.api.patch('settings', payload);
  }

  async upsertTranslationString<T extends Item>(payload: T): Promise<void> {
    if (payload.id) {
      await this.api.patch(`translations/${payload.id}`, payload);
      return;
    }
    await this.api.post('translations', payload);
  }

  getCollection(collection: string): Pick<Collection, 'collection'> | null {
    return this.collectionsStore.getCollection(collection);
  }

  private isSingleton(collection: string): boolean {
    return this.collectionsStore.getCollection(collection)?.meta?.singleton === true;
  }

  private applyOptions<T>(data: T, options: ItemOptions): T {
    if (!options.ignoreEmpty) return data;
    return Object.fromEntries(
      Object.entries(data as Record<string, unknown>).filter(([, value]) => value !== undefined && value !== null && value !== ''),
    ) as T;
  }
}
