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
    languagesCollectionCodeField: string;
  }[]
  settings: Settings;
  collectionFields: Field[];
  languages: string[];
};

type CreateValueForCollectionItem = {
  translationItem: Record<string, unknown>;
  fieldName: string;
  collection: string;
  languageRelationField: string;
  item: Item;
  settings: Settings;
  collectionFields: Field[];
  isSourceLanguageItem: boolean;
};

export class ContentFromCollections extends ContentForLocalazyBase {
  /**
   * Creates translatable content from collection items.
   * Optimized with pre-computed enabled fields set for O(1) lookups.
   */
  static createContentFromCollectionItems(data: CreateContentFromCollectionItems) {
    const {
      collection, items, enabledFields, translatableFieldAttributes, settings,
      collectionFields, languages,
    } = data;
    const translatableContent: TranslatableContent = { sourceLanguage: {}, otherLanguages: {} };

    // Pre-compute enabled fields set for O(1) lookups instead of O(n) filter calls
    // EnabledField has { collection: string, fields: string[] } structure
    const enabledFieldsForCollection = new Set(
      enabledFields
        .filter((ef) => ef.collection === collection)
        .flatMap((ef) => ef.fields),
    );

    // Pre-compute languages set for O(1) lookups
    const requestedLanguages = new Set(languages);

    // Cache source language for faster comparison
    const { source_language } = settings;

    for (const item of items) {
      for (const relationField of translatableFieldAttributes) {
        const translations: Array<Record<string, unknown>> = item[relationField.field];
        if (!Array.isArray(translations)) continue;

        for (const translationItem of translations) {
          // Handle both expanded object and direct value for the language code
          // If expanded: { languages_code: { code: 'en-US', name: 'English' } }
          // If direct: { languages_code: 'en-US' }
          const languageFieldValue = translationItem[relationField.fieldLanguageCodeField];
          let itemLanguage: string | undefined;

          if (typeof languageFieldValue === 'string') {
            // Direct value (language code is the FK value itself)
            itemLanguage = languageFieldValue;
          } else if (languageFieldValue && typeof languageFieldValue === 'object') {
            // Expanded object - get the code from the language record
            itemLanguage = (languageFieldValue as Record<string, unknown>)[relationField.languagesCollectionCodeField] as string;
          }

          // Skip if no language or not in requested languages
          if (!itemLanguage || !requestedLanguages.has(itemLanguage)) continue;

          const isSourceLanguageItem = source_language === itemLanguage;

          // Initialize other language object once
          if (!isSourceLanguageItem && !translatableContent.otherLanguages[itemLanguage]) {
            translatableContent.otherLanguages[itemLanguage] = {};
          }

          const sourceObject = isSourceLanguageItem
            ? translatableContent.sourceLanguage
            : translatableContent.otherLanguages[itemLanguage];

          // Process enabled fields directly with O(1) lookup
          for (const fieldName of Object.keys(translationItem)) {
            if (!enabledFieldsForCollection.has(fieldName)) continue;

            merge(sourceObject, this.createValueForCollectionItem({
              translationItem: translationItem as Record<string, unknown>,
              fieldName,
              collection,
              languageRelationField: relationField.field,
              item,
              settings,
              collectionFields,
              isSourceLanguageItem,
            }));
          }
        }
      }
    }

    return translatableContent;
  }

  private static buildMetaObjectForCollectionItem(
    data: Pick<CreateValueForCollectionItem, 'collection' | 'languageRelationField' | 'fieldName' | 'item' | 'collectionFields'>,
  ): Record<string, unknown> {
    const {
      collection, languageRelationField, fieldName, item, collectionFields,
    } = data;
    const fieldDetail = collectionFields.find((f) => f.field === fieldName);

    const meta: Record<string, unknown> = {
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
