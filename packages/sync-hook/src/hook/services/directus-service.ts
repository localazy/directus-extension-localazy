import type { CollectionOverview, Item, MutationOptions, Query, SchemaOverview } from '@directus/types';
import { DirectusApi } from '@localazy/directus-common';
import { DirectusApiResultTranslationString } from '@localazy/directus-common';
import { useGetCollectionFromSchema } from '../composables/use-get-collection-from-schema';
import type { ItemsServiceCtor } from '../types/directus-services';

export class DirectusApiService implements DirectusApi {
  protected schema: SchemaOverview;

  protected ItemsService: ItemsServiceCtor;

  constructor(ItemsService: ItemsServiceCtor, schema: SchemaOverview) {
    this.ItemsService = ItemsService;
    this.schema = schema;
  }

  async createDirectusItem<T extends Item>(collection: string, data: T) {
    const targetCollection = this.getCollection(collection);
    const { id: _id, ...rest } = data;
    // rest is Omit<T, 'id'>, which is structurally a Partial<T> minus the id slot.
    // createOne accepts Partial<T>; the cast bridges generic variance.
    const payload = rest as Partial<T>;
    if (targetCollection?.singleton === true) {
      await this.upsertSingleton(collection, data);
    } else {
      await this.createOne(collection, payload);
    }
  }

  async updateDirectusItem<T extends Item>(collection: string, itemId: number | string, data: T) {
    const targetCollection = this.getCollection(collection);
    if (targetCollection?.singleton === true) {
      // Singletons in Directus don't carry a per-id route; treat them the same as
      // `upsertSingleton` regardless of the `itemId` passed in.
      await this.upsertSingleton(collection, data);
      return;
    }
    await this.updateOne(collection, itemId, data as Partial<T>);
  }

  async fetchDirectusItems<T extends Item>(collection: string, query: Query = {}): Promise<T[]> {
    return this.readByQuery<T>(collection, query);
  }

  async fetchSettings() {
    const result = await this.readByQuery<Item>('directus_settings', {
      fields: ['translation_strings'],
      limit: -1,
    });
    return result[0] ?? null;
  }

  async fetchTranslationStrings() {
    return this.readByQuery<DirectusApiResultTranslationString>('directus_translations', {
      limit: -1,
    });
  }

  getCollection(collection: string): CollectionOverview | null {
    const { getCollection } = useGetCollectionFromSchema(this.schema);
    return getCollection(collection);
  }

  async upsertTranslationString<T extends Item>(payload: T) {
    await this.upsertOne('directus_translations', payload);
  }

  async updateSettings<T extends Item>(payload: T) {
    await this.upsertSingleton('directus_settings', payload);
  }

  // All ItemsService instances run with accountability: null (administrator permissions).
  // The hook needs to read/write Localazy's internal collections regardless of the
  // triggering user's permissions. emitEvents is set to false on writes so a hook-driven
  // write doesn't recursively re-trigger the same hook.

  private readByQuery<T extends Item>(collection: string, query: Query): Promise<T[]> {
    const service = new this.ItemsService<T>(collection, { schema: this.schema, accountability: null });
    return service.readByQuery(query);
  }

  private createOne<T extends Item>(collection: string, payload: Partial<T>) {
    const service = new this.ItemsService<T>(collection, { schema: this.schema, accountability: null });
    return service.createOne(payload, { emitEvents: false } as MutationOptions);
  }

  private upsertSingleton<T extends Item>(collection: string, payload: Partial<T>) {
    const service = new this.ItemsService<T>(collection, { schema: this.schema, accountability: null });
    return service.upsertSingleton(payload, { emitEvents: false } as MutationOptions);
  }

  private upsertOne<T extends Item>(collection: string, payload: Partial<T>) {
    const service = new this.ItemsService<T>(collection, { schema: this.schema, accountability: null });
    return service.upsertOne(payload, { emitEvents: false } as MutationOptions);
  }

  private updateOne<T extends Item>(collection: string, itemId: number | string, payload: Partial<T>) {
    const service = new this.ItemsService<T>(collection, { schema: this.schema, accountability: null });
    return service.updateOne(itemId, payload, { emitEvents: false } as MutationOptions);
  }
}
