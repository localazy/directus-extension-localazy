import { SchemaOverview } from '@directus/types';
import { isEmpty } from 'lodash';
import { TranslatableContent } from '../../../../common/models/translatable-content';
import { BaseContentSynchronizationService } from './base-content-synchronization-service';
import { Settings } from '../../../../common/models/collections-data/settings';
import { ContentTransferSetupDatabase } from '../../../../common/models/collections-data/content-transfer-setup';
import { ApiTranslatableCollectionsService } from '../translatable-collections-service';
import { EnabledFieldsService } from '../../../../common/utilities/enabled-fields-service';
import { trackDirectusError } from '../../functions/track-error';

type ExportCollectionContent = {
  schema: SchemaOverview;
  ItemsService: any;
  FieldsService: any;
  logger: any;
  keys: string[];
  collection: string;
 };

 type FetchTranslatableCollectionsContent = {
  schema: SchemaOverview;
  ItemsService: any;
  FieldsService: any;
  keys: string[];
  collection: string;
  settings: Settings;
  contentTransferSetup: ContentTransferSetupDatabase;
};

type DeprecateDeletedCollectionItems = {
  schema: SchemaOverview;
  logger: any;
  collection: string,
  itemIds: string[],
  ItemsService: any;
};

class CollectionContentSynchronizationService extends BaseContentSynchronizationService {
  async exportCollectionContent(data: ExportCollectionContent) {
    const {
      schema, ItemsService, logger, collection,
    } = data;
    if (this.missingLocalazyCollections(schema)) {
      logger.error('Localazy: Incomplete configuration');
      return;
    }
    try {
      const { settings, contentTransferSetup } = await this.resolveLocalazySettings(ItemsService, schema);
      const { localazyData } = await this.resolveLocalazyData(ItemsService, schema);
      if (settings && contentTransferSetup && localazyData) {
        const localazyProject = await this.loadProject(localazyData.access_token);

        if (!localazyProject) {
          logger.error('Localazy: Could not load project');
          return;
        }
        if (this.shouldDisableSyncOperations(localazyProject)) {
          logger.error('Localazy: Sync operations disabled due to payment status');
          return;
        }

        const translatableContent = await this.fetchTranslatableCollectionsContent({
          ...data,
          settings,
          contentTransferSetup,
        });
        if (!isEmpty(translatableContent.sourceLanguage)) {
          logger.info(`Localazy: Exporting ${collection} content for keys ${data.keys.join(', ')}`);
          await this.exportToLocalazy({
            schema,
            settings,
            localazyProject,
            localazyData,
            content: translatableContent,
          });
        } else {
          logger.info(`Localazy: Nothing to export for ${collection} and keys ${data.keys.join(', ')}`);
        }
      } else {
        logger.error('Localazy: Missing settings or content transfer setup');
      }
    } catch (e: any) {
      logger.info(`Localazy: Exporting ${collection} content for keys ${data.keys.join(', ')} failed`);
      logger.error(e);
      trackDirectusError(e, 'exportCollectionContent');
    }
  }

  async deprecateDeletedCollectionItems(options: DeprecateDeletedCollectionItems) {
    const {
      collection, itemIds, schema, ItemsService, logger,
    } = options;
    try {
      const { settings, contentTransferSetup } = await this.resolveLocalazySettings(ItemsService, schema);
      const { localazyData } = await this.resolveLocalazyData(ItemsService, schema);
      if (!settings || !contentTransferSetup || !localazyData) {
        logger.error('Localazy: Missing settings or content transfer setup');
        return;
      }

      if (settings.automated_deprecation !== 1) {
        return;
      }

      const localazyProject = await this.loadProject(localazyData.access_token);

      if (!localazyProject) {
        logger.error('Localazy: Could not load project');
        return;
      }
      if (this.shouldDisableSyncOperations(localazyProject)) {
        logger.error('Localazy: Sync operations disabled due to payment status');
        return;
      }

      const result = await this.fetchLocalazyContentInSourceLanguage({
        ItemsService,
        schema,
        contentTransferSetup,
        settings,
        localazyProject,
      });
      if (result) {
        const { importContent } = result;

        if (importContent.success) {
          const keysForCollection = importContent.content.collections.get(collection);
          const localazyKeysForDeprecation: Set<string> = new Set();

          Object.entries((keysForCollection?.items || {})).forEach(([directusId, localazyItemsInLanguage]) => {
            if (directusId && itemIds.includes(directusId)) {
              localazyItemsInLanguage.forEach((localazyItem) => {
                localazyItem.items.forEach((item) => {
                  localazyKeysForDeprecation.add(item.localazyKey.id);
                });
              });
            }
          });

          await this.deprecateLocalazyKeys(localazyData, localazyProject.id, Array.from(localazyKeysForDeprecation));
          logger.info(`Localazy: Deprecated ${localazyKeysForDeprecation.size} keys for collection ${collection}`);
        }
      } else {
        logger.error('Localazy: Could not deprecate deleted collection items');
      }
    } catch (e: any) {
      logger.error('Localazy: Deprecating deleted collection items failed');
      logger.error(e);
      trackDirectusError(e, 'deprecateDeletedCollectionItems');
    }
  }

  private async fetchTranslatableCollectionsContent(data: FetchTranslatableCollectionsContent): Promise<TranslatableContent> {
    const {
      schema, ItemsService, collection, keys, FieldsService, settings, contentTransferSetup,
    } = data;

    const translatableCollectionsService = new ApiTranslatableCollectionsService(
      ItemsService,
      schema,
      FieldsService,
    );

    const exportLanguages = await this.resolveExportLanguages(ItemsService, settings);
    const collectionsContent = translatableCollectionsService.fetchContentFromTranslatableCollections({
      translatableCollections: [{
        collection,
        itemIds: keys,
      }],
      languages: exportLanguages,
      enabledFields: EnabledFieldsService.parseFromDatabase(contentTransferSetup.enabled_fields),
      settings,
    });

    return collectionsContent;
  }
}

export const collectionContentSynchronizationService = new CollectionContentSynchronizationService();
