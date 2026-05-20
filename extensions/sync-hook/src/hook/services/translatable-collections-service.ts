import { SchemaOverview } from '@directus/types';
import { trackDirectusError } from '../functions/track-error';
import { DirectusApiService } from './directus-service';
import { ApiDirectusDataModelService } from './api-directus-data-model-service';
import {
  TranslatableCollectionsService,
  TranslatableCollectionsServiceOptions,
} from '../../../../common/services/translatable-collections-service';
import type { DirectusLogger, FieldsServiceCtor, ItemsServiceCtor } from '../types/directus-services';

export class ApiTranslatableCollectionsService {
  private translatableCollectionsService: TranslatableCollectionsService;
  private logger: DirectusLogger;

  constructor(ItemsService: ItemsServiceCtor, schema: SchemaOverview, FieldsService: FieldsServiceCtor, logger: DirectusLogger) {
    this.translatableCollectionsService = new TranslatableCollectionsService({
      directusApi: new DirectusApiService(ItemsService, schema),
      translatableCollectionsContent: new ApiDirectusDataModelService(schema, FieldsService),
    });
    this.logger = logger;
  }

  async fetchContentFromTranslatableCollections(options: TranslatableCollectionsServiceOptions) {
    try {
      return this.translatableCollectionsService.fetchContentFromTranslatableCollections(options);
    } catch (e: unknown) {
      trackDirectusError(this.logger, e, 'fetchContentFromTranslatableCollection');
      return {
        sourceLanguage: {},
        otherLanguages: {},
      };
    }
  }
}
