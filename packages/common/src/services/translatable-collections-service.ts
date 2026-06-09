import { Item, Relation, Field } from '@directus/types';
import { merge } from 'lodash';
import { ContentFromCollections } from '../utilities/content-from-collections-service';
import { EnabledField } from '../models/collections-data/content-transfer-setup';
import { createAsyncQueue } from '../utilities/async-queue';
import { Settings } from '../models/collections-data/settings';
import { TranslatableContent } from '../models/translatable-content';
import { FieldsUtilsService } from '../utilities/fields-utils-service';
import { DirectusApi } from '../interfaces/directus-api';
import { DirectusDataModel } from '../interfaces/directus-data-model';
import { computeItemHash } from '../utilities/upload-cursor';

type ResolveContentForCollectionReturn = {
  collection: string;
  translatableFieldAttributes: {
    field: string;
    fieldLanguageCodeField: string;
  }[];
  items: Item[];
};

/**
 * Per-item slice returned by `fetchContentWithHashesByCollection`. `id` is the Directus
 * item id; `hash` is the 16-hex-char SHA-256 of the canonical KV payload that would be
 * uploaded for this item right now (using the current `enabledFields`, source language,
 * `upload_existing_translations` mode, etc.); `content` is the assembled
 * `TranslatableContent` slice covering only this item. The orchestrator filters by hash
 * against the upload cursor, then merges the surviving slices into the global payload.
 */
export type CollectionItemWithHash = {
  id: string | number;
  hash: string;
  content: TranslatableContent;
};

export type CollectionContentWithHashes = {
  collection: string;
  items: CollectionItemWithHash[];
};

export type TranslatableCollectionsServiceOptions = {
  translatableCollections: {
    collection: string;
    itemIds?: string[];
  }[];
  languages: string[];
  enabledFields: EnabledField[];
  settings: Settings;
};

type ResolveContentForCollection = {
  collection: string;
  itemIds: string[];
  translationTypeFields: Field[];
  languagesCollectionCodeField: string;
  languagesCollection: string;
  languages: string[];
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
      deep: data.translationTypeFields.reduce(
        (acc, field) => {
          acc[field.field] = {
            _filter: {
              languages_code: { _in: data.languages },
            },
          };
          return acc;
        },
        {} as Record<string, { _filter: { languages_code: { _in: string[] } } }>,
      ),
    };

    if (data.itemIds.length > 0) {
      payload.filter = { id: { _in: data.itemIds } };
    }

    const result = await this.directusApi.fetchDirectusItems(data.collection, payload);

    const translatableFieldAttributes = data.translationTypeFields.map((field) => {
      const languageRelation = this.translatableCollectionsContent
        .getRelationsForField(data.collection, field.field)
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
    const { enabledFields, settings, languages, translatableCollections } = options;
    const { add, execute } = createAsyncQueue();
    const translatableContent: TranslatableContent = { sourceLanguage: {}, otherLanguages: {} };

    const enabledTranslatableCollections = translatableCollections.filter((collection) =>
      enabledFields.find((field) => field.collection === collection.collection),
    );

    enabledTranslatableCollections.forEach((data) => {
      add(async () =>
        this.resolveContentForCollection({
          collection: data.collection,
          itemIds: data.itemIds || [],
          translationTypeFields: await this.getTranslationTypeFieldsForCollection(data.collection),
          languages,
          languagesCollection: settings.language_collection,
          languagesCollectionCodeField: settings.language_code_field,
        }),
      );
    });

    const results = await execute<ResolveContentForCollectionReturn>({ delayBetween: 50 });

    for (const result of results) {
      if (result.data) {
        const collectionFields = (await this.translatableCollectionsContent.getFieldsForCollection(result.data.collection)) || [];
        merge(
          translatableContent,
          ContentFromCollections.createContentFromCollectionItems({
            collection: result.data.collection,
            items: result.data.items,
            enabledFields,
            collectionFields,
            translatableFieldAttributes: result.data.translatableFieldAttributes,
            settings,
          }),
        );
      }
    }

    return translatableContent;
  }

  /**
   * Same fetch shape as `fetchContentFromTranslatableCollections`, but returns per-item
   * slices with stable content hashes attached. The caller (the user-clicked Export
   * orchestrator) filters the per-item list against the upload cursor and only assembles
   * what remains.
   *
   * Hash inputs are the per-item slice of the canonical assembly output for "this item
   * with the current settings" — meaning anything that affects the wire payload (enabled
   * fields, source language code, `upload_existing_translations` mode via the fetched
   * language set, field values) naturally changes the hash. We deliberately do NOT hash a
   * synthetic "settings fingerprint" — the assembled per-item payload already reflects
   * every settings effect that matters.
   */
  async fetchContentWithHashesByCollection(options: TranslatableCollectionsServiceOptions): Promise<CollectionContentWithHashes[]> {
    const { enabledFields, settings, languages, translatableCollections } = options;
    const { add, execute } = createAsyncQueue();

    const enabledTranslatableCollections = translatableCollections.filter((collection) =>
      enabledFields.find((field) => field.collection === collection.collection),
    );

    enabledTranslatableCollections.forEach((data) => {
      add(async () =>
        this.resolveContentForCollection({
          collection: data.collection,
          itemIds: data.itemIds || [],
          translationTypeFields: await this.getTranslationTypeFieldsForCollection(data.collection),
          languages,
          languagesCollection: settings.language_collection,
          languagesCollectionCodeField: settings.language_code_field,
        }),
      );
    });

    const results = await execute<ResolveContentForCollectionReturn>({ delayBetween: 50 });
    const output: CollectionContentWithHashes[] = [];

    for (const result of results) {
      if (!result.data) continue;
      const collectionFields = (await this.translatableCollectionsContent.getFieldsForCollection(result.data.collection)) || [];
      const itemsWithHashes: CollectionItemWithHash[] = [];

      for (const item of result.data.items) {
        // Build the per-item content slice using the same assembly the multi-item path
        // uses — so the hash mechanically reflects exactly what would go on the wire for
        // this item under the current settings + enabled-fields configuration.
        const content = ContentFromCollections.createContentFromCollectionItems({
          collection: result.data.collection,
          items: [item],
          enabledFields,
          collectionFields,
          translatableFieldAttributes: result.data.translatableFieldAttributes,
          settings,
        });
        const hash = await computeItemHash(content);
        itemsWithHashes.push({ id: item.id, hash, content });
      }

      output.push({ collection: result.data.collection, items: itemsWithHashes });
    }

    return output;
  }
}
