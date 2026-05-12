import { ref } from 'vue';
import { useApi } from '@directus/extensions-sdk';
import {
  TranslatableCollectionsService,
  TranslatableCollectionsServiceOptions,
} from '../../../common/services/translatable-collections-service';
import { useTranslatableCollectionsContent } from './use-translatable-collections-content';
import { useErrorsStore } from '../stores/errors-store';
import { TranslatableContent } from '../../../common/models/translatable-content';
import { DirectusModuleApi } from '../services/directus-module-api';
import { useDirectusCollectionsStore } from './use-directus-stores';

export const useTranslatableCollections = () => {
  const loading = ref(false);
  const directusApi = new DirectusModuleApi(useApi(), useDirectusCollectionsStore());
  const translatableCollectionsService = new TranslatableCollectionsService({
    directusApi,
    translatableCollectionsContent: useTranslatableCollectionsContent(),
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
