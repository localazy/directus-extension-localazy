import { Query, Item, SchemaOverview } from '@directus/types';
import { DirectusApi } from '../../../common/interfaces/directus-api';
import { useGetCollectionFromSchema } from '../composables/use-get-collection-from-schema';

export class DirectusApiService implements DirectusApi {
  protected schema!: SchemaOverview;

  protected ItemsService!: any;

  constructor(ItemsService: any, schema: any) {
    this.ItemsService = ItemsService;
    this.schema = schema;
  }

  async updateDirectusItem<T extends Item>(collection: string, itemId: number | string, data: T) {
    const targetCollection = this.getCollection(collection);

    if (targetCollection?.singleton === true) {
      this.upsertSingleton(collection, data);
    } else {
      this.updateOne(collection, itemId, data);
    }
  }

  async createDirectusItem<T extends Item>(collection: string, data: T) {
    const targetCollection = this.getCollection(collection);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, ...payload } = data;
    if (targetCollection?.singleton === true) {
      this.upsertSingleton(collection, data);
    } else {
      this.createOne(collection, payload);
    }
  }

  async upsertDirectusItem<T extends Item>(collection: string, item: (Item & T) | null, payload: T) {
    if (item && item.id) {
      await this.updateDirectusItem(collection, item.id, payload);
    } else {
      await this.createDirectusItem(collection, payload);
    }
  }

  async fetchDirectusItems<T extends Item>(collection: string, query: Query = {}): Promise<T[]> {
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

  // All ItemsService instances run with accountability: null (administrator permissions).
  // The hook needs to read/write Localazy's internal collections regardless of the
  // triggering user's permissions. emitEvents is set to false on writes so a hook-driven
  // write doesn't recursively re-trigger the same hook.

  private readByQuery(collection: string, query: any) {
    return new this.ItemsService(collection, { schema: this.schema, accountability: null }).readByQuery(query);
  }

  private createOne(collection: string, payload: any) {
    return new this.ItemsService(collection, { schema: this.schema, accountability: null }).createOne(payload, { emitEvents: false });
  }

  private updateOne(collection: string, id: string | number, payload: any) {
    return new this.ItemsService(collection, { schema: this.schema, accountability: null }).updateOne(id, payload, { emitEvents: false });
  }

  private upsertSingleton(collection: string, payload: any) {
    return new this.ItemsService(collection, { schema: this.schema, accountability: null }).upsertSingleton(payload, { emitEvents: false });
  }

  private upsertOne(collection: string, payload: any) {
    return new this.ItemsService(collection, { schema: this.schema, accountability: null }).upsertOne(payload, { emitEvents: false });
  }
}
