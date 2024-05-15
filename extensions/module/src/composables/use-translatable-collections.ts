import { ref } from 'vue';
import {
  TranslatableCollectionsService, TranslatableCollectionsServiceOptions,
} from '../../../common/services/translatable-collections-service';
import { useDirectusApi } from './use-directus-api';
import { useTranslatableCollectionsContent } from './use-translatable-collections-content';
import { useErrorsStore } from '../stores/errors-store';
import { TranslatableContent } from '../../../common/models/translatable-content';

export const useTranslatableCollections = () => {
  const loading = ref(false);
  const translatableCollectionsService = new TranslatableCollectionsService({
    directusApi: useDirectusApi(),
    translatableCollectionsContent: useTranslatableCollectionsContent(),
  });
  const { addDirectusError } = useErrorsStore();

  async function fetchContentFromTranslatableCollections(options: TranslatableCollectionsServiceOptions): Promise<TranslatableContent> {
    loading.value = true;
    try {
      const result = await translatableCollectionsService.fetchContentFromTranslatableCollections(options);
      return result;
    } catch (e: any) {
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
