import { useStores, useApi } from '@directus/extensions-sdk';
import {
  Collection, DeepPartial, AppCollection, Field, Item, Query,
} from '@directus/types';
import { Ref, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { isEqual } from 'lodash';
import { useErrorsStore } from '../stores/errors-store';
import { DirectusApi } from '../../../common/interfaces/directus-api';

type UseDirectusApi = DirectusApi & {
  upsertDirectusCollection: (collection: string, values: DeepPartial<Collection & { fields: Field[] }>) => Promise<void>;
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

  const updateDirectusItem = async <T extends Item>(collection: string, itemId: number | string, data: T) => {
    loading.value = true;
    const targetCollection = getCollection(collection) as Collection;

    if (targetCollection?.meta?.singleton === true) {
      await api.patch(`/items/${collection}`, data);
    } else {
      await api.patch(`/items/${collection}/${itemId}`, data);
    }
    loading.value = false;
  };

  const createDirectusItem = async <T extends Item>(collection: string, data: T) => {
    loading.value = true;
    const targetCollection = getCollection(collection) as Collection;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, ...payload } = data;
    if (targetCollection?.meta?.singleton === true) {
      await api.patch(`/items/${collection}`, data);
    } else {
      await api.post(`/items/${collection}`, payload);
    }
    loading.value = false;
  };

  const upsertDirectusItem = async <T extends Item>(collection: string, item: Item & T | null, payload: T) => {
    try {
      if (item && item.id) {
        await updateDirectusItem(collection, item.id, payload);
      } else {
        await createDirectusItem(collection, payload);
      }
    } catch (e: any) {
      addDirectusError(e);
    }
  };

  const fetchDirectusItems = async (collection: string, query: Query = {}): Promise<Item[]> => {
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

  async function upsertDirectusCollection(collection: string, values: DeepPartial<Collection & { fields: Field[] }>) {
    const targetCollection = ref<AppCollection | null>(appCollections.find((c) => c.collection === collection) || null);
    try {
      if (targetCollection.value) {
        if (isEqual(targetCollection.value, values)) {
          return;
        }

        await api.patch<{ data: Collection }>(
          `/collections/${collection}`,
          values,
        );
      } else {
        await api.post<{ data: Collection }>('/collections', values);
      }
    } catch (e: any) {
      addDirectusError(e);
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

  return {
    updateDirectusItem,
    createDirectusItem,
    upsertDirectusItem,
    upsertDirectusCollection,
    fetchDirectusItems,
    fetchSettings,
    fetchTranslationStrings,
    updateSettings,
    upsertTranslationString,
    getCollection,
    loading,
  };
}
