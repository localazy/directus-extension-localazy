import { ref } from 'vue';
import { useApi, useStores } from '@directus/extensions-sdk';
import {
  TranslatableCollectionsService,
  TranslatableCollectionsServiceOptions,
} from '../../../common/services/translatable-collections-service';
import { useErrorsStore } from '../stores/errors-store';
import { TranslatableContent } from '../../../common/models/translatable-content';
import { DirectusDataModel } from '../../../common/interfaces/directus-data-model';
import { FieldsUtilsService } from '../../../common/utilities/fields-utils-service';
import { DirectusModuleApi } from '../services/directus-module-api';
import { useDirectusCollectionsStore } from './use-directus-stores';

export const useTranslatableCollections = () => {
  const loading = ref(false);
  const { useFieldsStore, useRelationsStore } = useStores();
  const fieldsStore = useFieldsStore();
  const relationsStore = useRelationsStore();
  const directusApi = new DirectusModuleApi(useApi(), useDirectusCollectionsStore());

  // The TranslatableCollectionsService expects a small adapter (DirectusDataModel) so the
  // common-side code doesn't depend on the SDK's store types directly. Inline it here —
  // there's exactly one construction site, so the previous separate composable was
  // indirection without payoff.
  const translatableCollectionsContent: DirectusDataModel = {
    getFieldsForCollection: (collection) => fieldsStore.getFieldsForCollection(collection),
    getRelationsForField: (collection, field) => relationsStore.getRelationsForField(collection, field),
    getTranslationTypeFields: (collection) => fieldsStore.getFieldsForCollection(collection).filter(FieldsUtilsService.isTranslationField),
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

  return {
    fetchContentFromTranslatableCollections,
    loading,
  };
};
