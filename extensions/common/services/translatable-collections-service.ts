/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-underscore-dangle */
import {
  Item, Relation, Field,
} from '@directus/types';
import { merge } from 'lodash';
import { ContentFromCollections } from '../utilities/content-from-collections-service';
import { EnabledField } from '../models/collections-data/content-transfer-setup';
import { useEnhancedAsyncQueue } from '../../module/src/composables/use-async-queue';
import { Settings } from '../models/collections-data/settings';
import { TranslatableContent } from '../models/translatable-content';
import { FieldsUtilsService } from '../utilities/fields-utils-service';
import { DirectusApi } from '../interfaces/directus-api';
import { DirectusDataModel } from '../interfaces/directus-data-model';

type ResolveContentForCollectionReturn = {
  collection: string;
  translatableFieldAttributes: {
    field: string;
    fieldLanguageCodeField: string;
  }[];
  items: Item[];
};

export type TranslatableCollectionsServiceOptions = {
  translatableCollections: {
    collection: string;
    itemIds?: string[];
  }[];
  languages: string[];
  enabledFields: EnabledField[],
  settings: Settings;
};

type ResolveContentForCollection = {
  collection: string;
  itemIds: string[];
  translationTypeFields: Field[];
  languagesCollectionCodeField: string,
  languagesCollection: string;
  languages: string[],
};

type Constructor = {
  directusApi: DirectusApi;
  translatableCollectionsContent: DirectusDataModel;
};

type BuildTranslatableCollectionsWithFieldsReturn = {
  collection: string;
  translationTypeFields: Field[];
}[];

export class TranslatableCollectionsService {
  private directusApi!: DirectusApi;

  private translatableCollectionsContent!: DirectusDataModel;

  constructor(data: Constructor) {
    this.directusApi = data.directusApi;
    this.translatableCollectionsContent = data.translatableCollectionsContent;
  }

  async buildTranslatableCollectionsWithFields(collections: string[]) {
    const output: BuildTranslatableCollectionsWithFieldsReturn = [];

    for (const collection of collections) {
      const fields = await this.translatableCollectionsContent.getFieldsForCollection(collection);
      const translationTypeFields = fields.filter(FieldsUtilsService.isTranslationField);
      if (translationTypeFields.length > 0) {
        output.push({
          collection,
          translationTypeFields,
        });
      }
    }

    return output;
  }

  async getTranslationTypeFieldsForCollection(collection: string) {
    const fields = await this.translatableCollectionsContent.getFieldsForCollection(collection);
    return fields.filter(FieldsUtilsService.isTranslationField);
  }

  async resolveContentForCollection(data: ResolveContentForCollection): Promise<ResolveContentForCollectionReturn> {
    const payload = {
      fields: ['id', ...data.translationTypeFields.map((field) => `${field.field}.*`)],
      filter: { id: { _in: data.itemIds } },
      limit: -1,
      deep: data.translationTypeFields.reduce((acc, field) => {
        acc[field.field] = {
          _filter: {
            languages_code: { _in: data.languages },
          },
        };
        return acc;
      }, {} as any),
    };

    if (data.itemIds.length > 0) {
      payload.filter = { id: { _in: data.itemIds } };
    }

    const result = await this.directusApi.fetchDirectusItems(data.collection, payload);

    const translatableFieldAttributes = data.translationTypeFields.map((field) => {
      const languageRelation = this.translatableCollectionsContent.getRelationsForField(data.collection, field.field)
        .find((relation: Relation) => relation.related_collection === data.languagesCollection);
      return {
        field: field.field,
        fieldLanguageCodeField: languageRelation?.field || '',
      };
    });

    return {
      collection: data.collection,
      translatableFieldAttributes,
      items: result,
    };
  }

  async fetchContentFromTranslatableCollections(options: TranslatableCollectionsServiceOptions) {
    const {
      enabledFields, settings, languages, translatableCollections,
    } = options;
    const { add, execute } = useEnhancedAsyncQueue();
    const translatableContent: TranslatableContent = { sourceLanguage: {}, otherLanguages: {} };

    const enabledTranslatableCollections = translatableCollections
      .filter((collection) => enabledFields.find((field) => field.collection === collection.collection));

    enabledTranslatableCollections.forEach((data) => {
      add(async () => this.resolveContentForCollection({
        collection: data.collection,
        itemIds: data.itemIds || [],
        translationTypeFields: await this.getTranslationTypeFieldsForCollection(data.collection),
        languages,
        languagesCollection: settings.language_collection,
        languagesCollectionCodeField: settings.language_code_field,
      }));
    });

    const results = await execute<ResolveContentForCollectionReturn>({ delayBetween: 50 });

    for (const result of results) {
      if (result.data) {
        const collectionFields = await this.translatableCollectionsContent.getFieldsForCollection(result.data.collection) || [];
        merge(translatableContent, ContentFromCollections
          .createContentFromCollectionItems({
            collection: result.data.collection,
            items: result.data.items,
            enabledFields,
            collectionFields,
            translatableFieldAttributes: result.data.translatableFieldAttributes,
            settings,
          }));
      }
    }

    return translatableContent;
  }
}
