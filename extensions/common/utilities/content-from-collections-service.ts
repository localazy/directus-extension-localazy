import { merge } from 'lodash';
import { Item, Field } from '@directus/types';
import { FieldsUtilsService } from './fields-utils-service';
import { EnabledField } from '../models/collections-data/content-transfer-setup';
import { Settings } from '../models/collections-data/settings';
import { TranslatableContent } from '../models/translatable-content';
import { ContentForLocalazyBase } from '../services/content-for-localazy/content-for-localazy-base';

type CreateContentFromCollectionItems = {
  collection: string;
  items: Item[];
  enabledFields: EnabledField[];
  translatableFieldAttributes: {
    field: string;
    fieldLanguageCodeField: string;
  }[]
  settings: Settings;
  collectionFields: Field[];
};

type CreateValueForCollectionItem = {
  translationItem: Record<string, any>,
  fieldName: string,
  collection: string,
  languageRelationField: string,
  item: Item,
  settings: Settings,
  collectionFields: Field[];
  isSourceLanguageItem: boolean;
};

export class ContentFromCollections extends ContentForLocalazyBase {
  static createContentFromCollectionItems(data: CreateContentFromCollectionItems) {
    const {
      collection, items, enabledFields, translatableFieldAttributes, settings,
      collectionFields,
    } = data;
    const translatableContent: TranslatableContent = { sourceLanguage: {}, otherLanguages: {} };

    items.forEach((item) => {
      translatableFieldAttributes.forEach((relationField) => {
        const translations: Array<Record<string, any>> = item[relationField.field];
        translations.forEach((translationItem) => {
          Object.keys(translationItem)
            .filter((fieldName) => FieldsUtilsService.isEnabledField(fieldName, collection, enabledFields))
            .forEach((fieldName) => {
              const itemLanguage = translationItem[relationField.fieldLanguageCodeField];
              if (itemLanguage) {
                const isSourceLanguageItem = settings.source_language === itemLanguage;
                if (!isSourceLanguageItem && !translatableContent.otherLanguages[itemLanguage]) {
                  translatableContent.otherLanguages[itemLanguage] = {};
                }

                const sourceObject = isSourceLanguageItem
                  ? translatableContent.sourceLanguage
                  : translatableContent.otherLanguages[itemLanguage];

                merge(sourceObject, this.createValueForCollectionItem({
                  translationItem,
                  fieldName,
                  collection,
                  languageRelationField: relationField.field,
                  item,
                  settings,
                  collectionFields,
                  isSourceLanguageItem,
                }));
              }
            });
        });
      });
    });

    return translatableContent;
  }

  private static buildMetaObjectForCollectionItem(
    data: Pick<CreateValueForCollectionItem, 'collection' | 'languageRelationField' | 'fieldName' | 'item' | 'collectionFields'>,
  ) {
    const {
      collection, languageRelationField, fieldName, item, collectionFields,
    } = data;
    const fieldDetail = collectionFields.find((f) => f.field === fieldName);

    const meta: Record<string, any> = {
      add: {
        directus: {
          collection,
          relation_field: languageRelationField,
          field: fieldName,
          itemId: item.id,
        },
      },
    };

    if (fieldDetail && typeof fieldDetail?.schema?.max_length === 'number') {
      meta.limit = fieldDetail.schema.max_length;
    }

    if (fieldDetail && fieldDetail?.schema?.comment) {
      meta.comment = fieldDetail.schema.comment;
    }

    return meta;
  }

  private static createValueForCollectionItem(data: CreateValueForCollectionItem) {
    const {
      translationItem,
      fieldName,
      collection,
      languageRelationField,
      item,
      settings,
      collectionFields,
      isSourceLanguageItem,
    } = data;
    const sourceValue = translationItem[fieldName];
    const { skip_empty_strings } = settings;
    if (sourceValue || (!skip_empty_strings && sourceValue !== undefined)) {
      const payload = {
        [fieldName]: sourceValue || '',
      };
      if (isSourceLanguageItem) {
        payload[`${this.META_IDENTIFIER}${fieldName}`] = this.buildMetaObjectForCollectionItem({
          collection,
          languageRelationField,
          fieldName,
          item,
          collectionFields,
        });
      }

      return {
        [collection]: {
          [item.id]: {
            [languageRelationField]: payload,
          },
        },
      };
    }
    return {};
  }
}
