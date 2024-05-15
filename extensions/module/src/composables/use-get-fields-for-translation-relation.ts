import { Field, Relation } from '@directus/types';
import { useStores } from '@directus/extensions-sdk';
import { FieldsUtilsService } from '../../../common/utilities/fields-utils-service';

export const useGetFieldsForTranslationRelation = () => {
  const { useFieldsStore, useRelationsStore, useCollectionsStore } = useStores();
  const { getFieldsForCollection } = useFieldsStore();
  const { getRelationsForField } = useRelationsStore();
  const { getCollection } = useCollectionsStore();

  const getTranslatableFields = (collection: string) => {
    const fields: Field[] = getFieldsForCollection(collection);
    const translationFields = fields.filter(FieldsUtilsService.isTranslationField);
    let relevantFieldsInTranslatableCollection: Field[] = [];

    translationFields.forEach((translationField) => {
      const relations: Relation[] = getRelationsForField(translationField.collection, translationField.field);
      if (relations.length > 0) {
        const excludedFields = relations.map((relation) => relation.field);
        // eslint-disable-next-line vue/max-len
        const relatedCollection = getCollection(relations[0]!.collection); // Translations field always has 2 relations pointing to the same collection;
        if (relatedCollection) {
          const fieldsForRelatedCollection: Field[] = getFieldsForCollection(relatedCollection.collection);
          relevantFieldsInTranslatableCollection = [
            ...relevantFieldsInTranslatableCollection,
            ...fieldsForRelatedCollection
              .filter((field) => !excludedFields.includes(field.field)),
          ];
        }
      }
    });
    return {
      translatableFields: relevantFieldsInTranslatableCollection.filter(FieldsUtilsService.isTranslatableField),
      allFields: relevantFieldsInTranslatableCollection,
    };
  };

  return {
    getTranslatableFields,
  };
};
