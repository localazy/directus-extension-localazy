import { Field, Relation } from '@directus/types';

export interface DirectusDataModel {
  getFieldsForCollection(collection: string): Promise<Field[]>;

  getRelationsForField(collection: string, field: string): Relation[];

  getTranslationTypeFields(translatableCollection: string): Promise<Field[]>;
}
