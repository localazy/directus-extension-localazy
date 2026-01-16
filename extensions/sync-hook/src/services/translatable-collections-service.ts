import {
  SchemaOverview,
} from '@directus/types';
import { trackDirectusError } from '../functions/track-error';
import { DirectusApiService } from './directus-service';
import { ApiDirectusDataModelService } from './api-directus-data-model-service';
import {
  TranslatableCollectionsService,
  TranslatableCollectionsServiceOptions,
} from '../../../common/services/translatable-collections-service';
import {
  DirectusItemsServiceConstructor,
  DirectusFieldsServiceConstructor,
} from '../../../common/types/directus-services';

export class ApiTranslatableCollectionsService {
  private translatableCollectionsService!: TranslatableCollectionsService;

  constructor(ItemsService: DirectusItemsServiceConstructor, schema: SchemaOverview, FieldsService: DirectusFieldsServiceConstructor) {
    this.translatableCollectionsService = new TranslatableCollectionsService({
      directusApi: new DirectusApiService(ItemsService, schema),
      translatableCollectionsContent: new ApiDirectusDataModelService(schema, FieldsService),
    });
  }

  async fetchContentFromTranslatableCollections(options: TranslatableCollectionsServiceOptions) {
    try {
      return this.translatableCollectionsService.fetchContentFromTranslatableCollections(options);
    } catch (e) {
      trackDirectusError(e instanceof Error ? e : new Error(String(e)), 'fetchContentFromTranslatableCollection');
      return {
        sourceLanguage: {},
        otherLanguages: {},
      };
    }
  }
}
