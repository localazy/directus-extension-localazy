import { useStores } from '@directus/extensions-sdk';
import { computed, type ComputedRef } from 'vue';
import type { AppCollection, Collection, Relation } from '@directus/types';

/**
 * Shape of the Directus admin's collections Pinia store that this extension uses.
 *
 * Directus' extensions SDK 17 widened useStores()'s return type so the inner
 * stores no longer expose their member typings to the consumer. The actual
 * runtime shape is unchanged. This wrapper asserts the subset we depend on in
 * one place rather than scattering casts at every call site.
 */
type CollectionsStore = {
  collections: AppCollection[];
  allCollections: AppCollection[];
  getCollection: (collection: string) => Collection | null;
  hydrate: () => Promise<void>;
};

type CollectionsStoreRefs = {
  collections: ComputedRef<AppCollection[]>;
  allCollections: ComputedRef<AppCollection[]>;
};

export const useDirectusCollectionsStore = (): CollectionsStore => {
  const stores = useStores();
  return stores.useCollectionsStore() as CollectionsStore;
};

/**
 * Returns reactive accessors for the collections store. Equivalent to
 * `storeToRefs(useDirectusCollectionsStore())` but typed correctly — `storeToRefs`
 * can't infer through the SDK's widened store type. Pinia state properties are
 * already reactive at runtime, so wrapping in `computed` here is a typing
 * convenience and does not add a real reactivity layer.
 */
export const useDirectusCollectionsStoreRefs = (): CollectionsStoreRefs => {
  const store = useDirectusCollectionsStore();
  return {
    collections: computed(() => store.collections),
    allCollections: computed(() => store.allCollections),
  };
};

/** Subset of Directus' relations Pinia store that this extension depends on. */
type RelationsStore = {
  getRelationsForField: (collection: string, field: string) => Relation[];
};

export const useDirectusRelationsStore = (): RelationsStore => {
  const stores = useStores();
  return stores.useRelationsStore() as RelationsStore;
};
