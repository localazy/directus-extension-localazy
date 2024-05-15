/* eslint-disable class-methods-use-this */
import {
  Query, Item, SchemaOverview,
} from '@directus/types';
import { DirectusApi } from '../../../common/interfaces/directus-api';
import { useGetCollectionFromSchema } from '../composables/use-get-collection-from-schema';

export class DirectusApiService implements DirectusApi {
  protected schema!: SchemaOverview;

  protected ItemsService!: any;

  constructor(ItemsService: any, schema: any) {
    this.ItemsService = ItemsService;
    this.schema = schema;
  }

  async updateDirectusItem <T extends Item>(collection: string, itemId: number | string, data: T) {
    const targetCollection = this.getCollection(collection);

    if (targetCollection?.singleton === true) {
      this.upsertSingleton(collection, data);
    } else {
      this.updateOne(collection, itemId, data);
    }
  }

  async createDirectusItem <T extends Item>(collection: string, data: T) {
    const targetCollection = this.getCollection(collection);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, ...payload } = data;
    if (targetCollection?.singleton === true) {
      this.upsertSingleton(collection, data);
    } else {
      this.createOne(collection, payload);
    }
  }

  async upsertDirectusItem <T extends Item>(collection: string, item: Item & T | null, payload: T) {
    if (item && item.id) {
      await this.updateDirectusItem(collection, item.id, payload);
    } else {
      await this.createDirectusItem(collection, payload);
    }
  }

  async fetchDirectusItems(collection: string, query: Query = {}): Promise<Item[]> {
    return this.readByQuery(collection, query);
  }

  async fetchSettings() {
    const result = await this.readByQuery('directus_settings', {
      fields: ['translation_strings'],
      limit: -1,
    });
    return result[0];
  }

  async fetchTranslationStrings() {
    return this.readByQuery('directus_translations', {
      limit: -1,
    });
  }

  getCollection(collection: string) {
    const { getCollection } = useGetCollectionFromSchema(this.schema);
    return getCollection(collection) as SchemaOverview['collections'][0] | null;
  }

  async upsertTranslationString<T extends Item>(payload: T) {
    await this.upsertOne('directus_translations', payload);
  }

  async updateSettings(payload: any) {
    await this.upsertSingleton('directus_settings', payload);
  }

  private readByQuery(collection: string, query: any) {
    return (new this.ItemsService(collection, { schema: this.schema })).readByQuery(query);
  }

  private createOne(collection: string, payload: any) {
    return (new this.ItemsService(collection, { schema: this.schema })).createOne(payload);
  }

  private updateOne(collection: string, id: string | number, payload: any) {
    return (new this.ItemsService(collection, { schema: this.schema })).updateOne(id, payload);
  }

  private upsertSingleton(collection: string, payload: any) {
    return (new this.ItemsService(collection, { schema: this.schema })).upsertSingleton(payload);
  }

  private upsertOne(collection: string, payload: any) {
    return (new this.ItemsService(collection, { schema: this.schema })).upsertOne(payload);
  }
}
