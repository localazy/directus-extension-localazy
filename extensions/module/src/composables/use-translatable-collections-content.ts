import { useStores } from '@directus/extensions-sdk';
import { DirectusDataModel } from '../../../common/interfaces/directus-data-model';
import { FieldsUtilsService } from '../../../common/utilities/fields-utils-service';

export const useTranslatableCollectionsContent = (): DirectusDataModel => {
  const { useFieldsStore, useRelationsStore } = useStores();
  const fieldsStore = useFieldsStore();
  const relationsStore = useRelationsStore();

  function getFieldsForCollection(collection: string) {
    return fieldsStore.getFieldsForCollection(collection);
  }
  function getRelationsForField(collection: string, field: string) {
    return relationsStore.getRelationsForField(collection, field);
  }
  function getTranslationTypeFields(translatableCollection: string) {
    const fields = getFieldsForCollection(translatableCollection);
    return fields.filter(FieldsUtilsService.isTranslationField);
  }

  return {
    getFieldsForCollection,
    getRelationsForField,
    getTranslationTypeFields,
  };
};
