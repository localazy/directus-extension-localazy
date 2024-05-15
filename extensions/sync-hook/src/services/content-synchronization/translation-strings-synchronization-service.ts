import { SchemaOverview } from '@directus/types';
import { isEmpty } from 'lodash';
import { TranslatableContent } from '../../../../common/models/translatable-content';
import { TranslationStringsService } from '../../../../common/services/translation-strings-service';
import { BaseContentSynchronizationService } from './base-content-synchronization-service';
import { Settings } from '../../../../common/models/collections-data/settings';
import { ContentTransferSetupDatabase } from '../../../../common/models/collections-data/content-transfer-setup';
import { DirectusApiService } from '../directus-service';
import { trackDirectusError } from '../../functions/track-error';

type ExportTranslationString = {
  schema: SchemaOverview;
  logger: any;
  ItemsService: any;
};

type FetchTranslationStrings = {
  schema: SchemaOverview;
  ItemsService: any;
  settings: Settings;
  contentTransferSetup: ContentTransferSetupDatabase;
};

type DeprecateDeletedTranslationStrings = {
  schema: SchemaOverview;
  itemIds: string[];
  logger: any;
  ItemsService: any;
};

class TranslationStringsSynchronizationService extends BaseContentSynchronizationService {
  async exportTranslationString(data: ExportTranslationString) {
    const { schema, ItemsService, logger } = data;
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

        const translatableContent = await this.fetchTranslationStrings({
          ...data,
          settings,
          contentTransferSetup,
        });
        if (!isEmpty(translatableContent.sourceLanguage)) {
          logger.info('Localazy: Exporting translation strings');
          await this.exportToLocalazy({
            schema,
            settings,
            localazyData,
            content: translatableContent,
            localazyProject,
          });
        } else {
          logger.info('Localazy: Nothing to export');
        }
      } else {
        logger.error('Localazy: Missing settings or content transfer setup');
      }
    } catch (e: any) {
      logger.error('Localazy: Exporting translation strings failed');
      logger.error(e);
      trackDirectusError(e, 'exportCollectionContent');
    }
  }

  async deprecateDeletedTranslationStrings(options: DeprecateDeletedTranslationStrings) {
    const {
      itemIds, schema, ItemsService, logger,
    } = options;
    if (this.missingLocalazyCollections(schema)) {
      logger.error('Localazy: Incomplete configuration');
      return;
    }

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
          const deleletedTranslationStrings: Set<string> = new Set();
          importContent.content.translationStrings.forEach((translationString) => {
            const { directusId } = translationString;
            if (itemIds.includes(directusId)) {
              deleletedTranslationStrings.add(translationString.localazyKey.id);
            }
          });

          await this.deprecateLocalazyKeys(localazyData, localazyProject.id, Array.from(deleletedTranslationStrings));
          logger.info(`Localazy: Deprecated ${deleletedTranslationStrings.size} translation strings`);
        }
      } else {
        logger.error('Localazy: Could not deprecate deleted translation strings');
      }
    } catch (e: any) {
      logger.error('Localazy: Deprecating deleted translation strings failed');
      logger.error(e);
      trackDirectusError(e, 'deprecateDeletedCollectionItems');
    }
  }

  private async fetchTranslationStrings(data: FetchTranslationStrings): Promise<TranslatableContent> {
    const {
      schema, ItemsService, settings, contentTransferSetup,
    } = data;
    if (this.missingLocalazyCollections(schema)) {
      return { sourceLanguage: {}, otherLanguages: {} };
    }

    const translationStringsService = new TranslationStringsService(
      new DirectusApiService(
        ItemsService,
        schema,
      ),
    );

    const exportLanguages = await this.resolveExportLanguages(ItemsService, settings);
    try {
      const translationStrings = await translationStringsService.fetchTranslationStrings({
        languages: exportLanguages,
        settings,
        synchronizeTranslationStrings: contentTransferSetup.translation_strings,
      });

      return translationStrings;
    } catch (e: any) {
      trackDirectusError(e, 'fetchTranslationStrings');
      return {
        sourceLanguage: {},
        otherLanguages: {},
      };
    }
  }
}

export const translationStringsSynchronizationService = new TranslationStringsSynchronizationService();
