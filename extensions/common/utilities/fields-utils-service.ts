import { Field } from '@directus/types';
import { EnabledField } from '../models/collections-data/content-transfer-setup';

export class FieldsUtilsService {
  static isTranslatableField(field: Field) {
    return ['string', 'text'].includes(field.type);
  }

  static isTranslationField(field: Field) {
    return field.meta?.interface === 'translations';
  }

  static isEnabledField(field: string, collection: string, enabledFields: EnabledField[]): boolean {
    const enabledCollection = enabledFields.find((enabledField) => enabledField.collection === collection);
    if (enabledCollection) {
      return enabledCollection.fields.includes(field);
    }
    return false;
  }
}
