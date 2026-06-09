import { ref } from 'vue';
import { useApi } from '@directus/extensions-sdk';
import {
  CollectionContentWithHashes,
  TranslatableCollectionsService,
  TranslatableCollectionsServiceOptions,
} from '@localazy/directus-common';
import { useErrorsStore } from '../stores/errors-store';
import { TranslatableContent } from '@localazy/directus-common';
import { DirectusDataModel } from '@localazy/directus-common';
import { FieldsUtilsService } from '@localazy/directus-common';
import { DirectusModuleApi } from '../services/directus-module-api';
import { useDirectusCollectionsStore, useDirectusFieldsStore, useDirectusRelationsStore } from './use-directus-stores';

export const useTranslatableCollections = () => {
  const loading = ref(false);
  const fieldsStore = useDirectusFieldsStore();
  const relationsStore = useDirectusRelationsStore();
  const directusApi = new DirectusModuleApi(useApi(), useDirectusCollectionsStore());

  // The TranslatableCollectionsService expects a small adapter (DirectusDataModel) so the
  // common-side code doesn't depend on the SDK's store types directly. Inline it here —
  // there's exactly one construction site, so the previous separate composable was
  // indirection without payoff. The interface returns Promises because the hook
  // implementation is genuinely async (DB calls); we resolve synchronously here.
  const translatableCollectionsContent: DirectusDataModel = {
    getFieldsForCollection: async (collection) => fieldsStore.getFieldsForCollection(collection),
    getRelationsForField: (collection, field) => relationsStore.getRelationsForField(collection, field),
    getTranslationTypeFields: async (collection) =>
      fieldsStore.getFieldsForCollection(collection).filter(FieldsUtilsService.isTranslationField),
  };

  const translatableCollectionsService = new TranslatableCollectionsService({
    directusApi,
    translatableCollectionsContent,
  });
  const { addDirectusError } = useErrorsStore();

  async function fetchContentFromTranslatableCollections(options: TranslatableCollectionsServiceOptions): Promise<TranslatableContent> {
    loading.value = true;
    try {
      const result = await translatableCollectionsService.fetchContentFromTranslatableCollections(options);
      return result;
    } catch (e: unknown) {
      addDirectusError(e);
      return {
        sourceLanguage: {},
        otherLanguages: {},
      };
    } finally {
      loading.value = false;
    }
  }

  /**
   * Per-item fetch path used by the user-clicked Export orchestrator. Returns per-item
   * content slices with content hashes attached so the orchestrator can filter by the
   * upload cursor before assembling the final payload. Errors are routed through the
   * errors store and degrade to an empty result.
   */
  async function fetchContentWithHashesByCollection(
    options: TranslatableCollectionsServiceOptions,
  ): Promise<CollectionContentWithHashes[]> {
    loading.value = true;
    try {
      return await translatableCollectionsService.fetchContentWithHashesByCollection(options);
    } catch (e: unknown) {
      addDirectusError(e);
      return [];
    } finally {
      loading.value = false;
    }
  }

  return {
    fetchContentFromTranslatableCollections,
    fetchContentWithHashesByCollection,
    loading,
  };
};
