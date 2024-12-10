import { useStores, useApi } from '@directus/extensions-sdk';
import {
  Collection, DeepPartial, AppCollection, Field, Item, Query,
} from '@directus/types';
import { Ref, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { isEmpty, isEqual } from 'lodash';
import { useErrorsStore } from '../stores/errors-store';
import { DirectusApi, ItemOptions } from '../../../common/interfaces/directus-api';

type UseDirectusApi = DirectusApi & {
  upsertDirectusCollection: (collection: string, values: DeepPartial<Collection & { fields: Field[] }>) => Promise<AppCollection>;
  loading: Ref<boolean>;
};

export function useDirectusApi(): UseDirectusApi {
  const { useCollectionsStore } = useStores();
  const { getCollection } = useCollectionsStore();
  const { collections } = storeToRefs(useCollectionsStore());
  const api = useApi();
  const loading = ref(false);
  const { addDirectusError } = useErrorsStore();
  const appCollections = collections?.value as AppCollection[];

  const updateDirectusItem = async <T extends Item>(collection: string, itemId: number | string, data: T, options: ItemOptions = {}) => {
    const resolvedPayload = options.ignoreEmpty
      ? Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined && value !== null && value !== ''))
      : data;
    const isSingleton = getCollection(collection)?.meta?.singleton === true;

    if (isEmpty(resolvedPayload)) {
      return;
    }
    if (isSingleton && Object.keys(resolvedPayload).length === 0 && !!resolvedPayload.id) {
      // Don't update singleton if ID is present and no other data is present
      return;
    }

    loading.value = true;
    if (isSingleton) {
      await api.patch(`/items/${collection}`, resolvedPayload);
    } else {
      await api.patch(`/items/${collection}/${itemId}`, resolvedPayload);
    }
    loading.value = false;
  };

  const createDirectusItem = async <T extends Item>(collection: string, data: T, options: ItemOptions = {}) => {
    const resolvedPayload = options.ignoreEmpty
      ? Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined && value !== null && value !== ''))
      : data;
    const isSingleton = getCollection(collection)?.meta?.singleton === true;

    if (isEmpty(resolvedPayload)) {
      return;
    }

    if (isSingleton && Object.keys(resolvedPayload).length === 0 && !!resolvedPayload.id) {
      // Don't update singleton if ID is present and no other data is present
      return;
    }

    loading.value = true;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, ...payload } = resolvedPayload;
    if (isSingleton) {
      await api.patch(`/items/${collection}`, {
        ...resolvedPayload,
        id: resolvedPayload.id || 1,
      });
    } else {
      await api.post(`/items/${collection}`, payload);
    }
    loading.value = false;
  };

  const upsertDirectusItem = async <T extends Item>(collection: string, item: Item & T | null, payload: T, options: ItemOptions = {}) => {
    const resolvedPayload = options.ignoreEmpty
      ? Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined && value !== null && value !== ''))
      : payload;

    if (isEmpty(resolvedPayload)) {
      return;
    }

    try {
      if (item && item.id) {
        await updateDirectusItem(collection, item.id, resolvedPayload);
      }
      await createDirectusItem(collection, resolvedPayload);
    } catch (e: any) {
      addDirectusError(e);
      throw e;
    }
  };

  const fetchDirectusItems = async <T extends Item>(collection: string, query: Query = {}): Promise<T[]> => {
    try {
      const result = await api.get(`/items/${collection}`, {
        params: query,
      });
      return result.data.data;
    } catch (e: any) {
      addDirectusError(e);
      return [];
    }
  };

  const fetchDirectusSingletonItem = async <T extends Item>(collection: string, query: Query = {}): Promise<T> => {
    try {
      const result = await api.get(`/items/${collection}`, {
        params: query,
      });
      return result.data.data;
    } catch (e: any) {
      addDirectusError(e);
      throw e;
    }
  };

  async function upsertDirectusCollection(collection: string, values: DeepPartial<Collection & { fields: Field[] }>):
   Promise<AppCollection> {
    const targetCollection = ref<AppCollection | null>(appCollections.find((c) => c.collection === collection) || null);
    try {
      if (targetCollection.value) {
        if (isEqual(targetCollection.value, values)) {
          return targetCollection.value;
        }

        const result = await api.patch<{ data: AppCollection }>(
          `/collections/${collection}`,
          values,
        );
        return result.data.data;
      }
      const result = await api.post<{ data: AppCollection }>('/collections', values);
      return result.data.data;
    } catch (e: any) {
      addDirectusError(e);
      throw e;
    }
  }

  async function fetchSettings() {
    try {
      const result = await api.get('settings', {
        params: {
          fields: ['translation_strings'],
          limit: -1,
        },
      });
      return result.data.data;
    } catch (e: any) {
      addDirectusError(e);
      return null;
    }
  }

  async function fetchTranslationStrings() {
    try {
      const result = await api.get('translations', {
        params: {
          limit: -1,
        },
      });
      return result.data.data;
    } catch (e: any) {
      addDirectusError(e);
      return null;
    }
  }

  async function updateSettings<T extends Item>(data: T) {
    loading.value = true;
    await api.patch('settings', data);
    loading.value = false;
  }

  async function upsertTranslationString<T extends Item>(data: T) {
    loading.value = true;
    if (data.id) {
      await api.patch(`translations/${data.id}`, data);
    } else {
      await api.post('translations', data);
    }
    loading.value = false;
  }

  async function createField(collection: string, field: DeepPartial<Field>) {
    loading.value = true;
    try {
      await api.post(`collections/${collection}/fields`, field);
    } catch (e: any) {
      addDirectusError(e);
    }
    loading.value = false;
  }

  return {
    updateDirectusItem,
    createDirectusItem,
    upsertDirectusItem,
    upsertDirectusCollection,
    fetchDirectusItems,
    fetchDirectusSingletonItem,
    fetchSettings,
    fetchTranslationStrings,
    updateSettings,
    upsertTranslationString,
    createField,
    getCollection,
    loading,
  };
}
