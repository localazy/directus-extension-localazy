/* eslint-disable no-use-before-define */
import { sortBy, uniqWith } from 'lodash';
import { computed } from 'vue';
import { AppCollection } from '@directus/types';
import { useStores } from '@directus/extensions-sdk';
import { storeToRefs } from 'pinia';
import { FieldsUtilsService } from '../../../common/utilities/fields-utils-service';

export const useCollectionsOrganizer = () => {
  const { useCollectionsStore, useFieldsStore } = useStores();
  const { allCollections } = storeToRefs(useCollectionsStore());
  const { getFieldsForCollection } = useFieldsStore();

  const collections = computed<AppCollection[]>(() => (
    sortBy(
      allCollections?.value.filter((c: AppCollection) => c.meta),
      ['meta.sort', 'collection'],
    )
  ));

  const translatableCollections = computed(() => {
    const collectionsToTranslate: AppCollection[] = [];

    collections.value.forEach((collection: AppCollection) => {
      const fields = getFieldsForCollection(collection.collection);
      const translationsField = fields.find(FieldsUtilsService.isTranslationField);
      if (translationsField) {
        collectionsToTranslate.push(collection);
      }
    });

    return uniqWith(collectionsToTranslate, (a, b) => a.collection === b.collection);
  });

  const rootCollections = computed(() => collections.value.filter((collection) => !collection.meta?.group));
  const translatableRootCollections = computed(() => rootCollections.value.filter(isTranslatableCollection));

  function getNestedCollections(collection: AppCollection) {
    return collections.value.filter((c) => c.meta?.group === collection.collection);
  }

  function isTranslatableCollection(collection: AppCollection): boolean {
    const isTranslatable = translatableCollections.value.some((c) => c.collection === collection.collection);
    if (isTranslatable) {
      return true;
    }

    return getNestedCollections(collection).some(isTranslatableCollection);
  }

  return {
    rootCollections,
    translatableRootCollections,
    translatableCollections,
    collections,
  };
};
