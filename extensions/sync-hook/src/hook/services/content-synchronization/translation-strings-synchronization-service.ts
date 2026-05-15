import { SchemaOverview } from '@directus/types';
import { isEmpty } from 'lodash';
import { TranslatableContent } from '../../../../../common/models/translatable-content';
import { TranslationStringsService } from '../../../../../common/services/translation-strings-service';
import { BaseContentSynchronizationService } from './base-content-synchronization-service';
import { Settings } from '../../../../../common/models/collections-data/settings';
import { ContentTransferSetupDatabase } from '../../../../../common/models/collections-data/content-transfer-setup';
import { DirectusApiService } from '../directus-service';
import { trackDirectusError } from '../../functions/track-error';
import type { DirectusLogger, ItemsServiceCtor } from '../../types/directus-services';

type ExportTranslationString = {
  schema: SchemaOverview;
  logger: DirectusLogger;
  ItemsService: ItemsServiceCtor;
};

type FetchTranslationStrings = {
  schema: SchemaOverview;
  ItemsService: ItemsServiceCtor;
  settings: Settings;
  contentTransferSetup: ContentTransferSetupDatabase;
};

type DeprecateDeletedTranslationStrings = {
  schema: SchemaOverview;
  itemIds: string[];
  logger: DirectusLogger;
  ItemsService: ItemsServiceCtor;
};

class TranslationStringsSynchronizationService extends BaseContentSynchronizationService {
  async exportTranslationString(data: ExportTranslationString) {
    const { schema, ItemsService, logger } = data;
    if (this.missingLocalazyCollections(schema)) {
      logger.debug('Localazy: not configured yet — skipping translation strings export');
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
    } catch (e: unknown) {
      logger.error('Localazy: Exporting translation strings failed');
      logger.error(e);
      trackDirectusError(e, 'exportCollectionContent');
    }
  }

  async deprecateDeletedTranslationStrings(options: DeprecateDeletedTranslationStrings) {
    const { itemIds, schema, ItemsService, logger } = options;
    if (this.missingLocalazyCollections(schema)) {
      logger.debug('Localazy: not configured yet — skipping deletion deprecation');
      return;
    }

    try {
      const { settings, contentTransferSetup } = await this.resolveLocalazySettings(ItemsService, schema);
      const { localazyData } = await this.resolveLocalazyData(ItemsService, schema);
      if (!settings || !contentTransferSetup || !localazyData) {
        logger.error('Localazy: Missing settings or content transfer setup');
        return;
      }

      // Deprecation is a sub-behavior of automated export — gated by both flags so the master
      // toggle on the Automation page guarantees zero outbound activity when off. See ADR-0001.
      if (!settings.automated_upload || !settings.automated_deprecation) {
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
              // Each language has its own Localazy key id; deprecate them all, not just one.
              Object.values(translationString.localazyKeys).forEach((localazyKey) => {
                deleletedTranslationStrings.add(localazyKey.id);
              });
            }
          });

          await this.deprecateLocalazyKeys(localazyData, localazyProject.id, Array.from(deleletedTranslationStrings));
          logger.info(`Localazy: Deprecated ${deleletedTranslationStrings.size} translation strings`);
        }
      } else {
        logger.error('Localazy: Could not deprecate deleted translation strings');
      }
    } catch (e: unknown) {
      logger.error('Localazy: Deprecating deleted translation strings failed');
      logger.error(e);
      trackDirectusError(e, 'deprecateDeletedCollectionItems');
    }
  }

  private async fetchTranslationStrings(data: FetchTranslationStrings): Promise<TranslatableContent> {
    const { schema, ItemsService, settings, contentTransferSetup } = data;
    if (this.missingLocalazyCollections(schema)) {
      return { sourceLanguage: {}, otherLanguages: {} };
    }

    const translationStringsService = new TranslationStringsService(new DirectusApiService(ItemsService, schema));

    const exportLanguages = await this.resolveExportLanguages(ItemsService, schema, settings);
    try {
      const translationStrings = await translationStringsService.fetchTranslationStrings({
        languages: exportLanguages,
        settings,
        synchronizeTranslationStrings: contentTransferSetup.translation_strings,
      });

      return translationStrings;
    } catch (e: unknown) {
      trackDirectusError(e, 'fetchTranslationStrings');
      return {
        sourceLanguage: {},
        otherLanguages: {},
      };
    }
  }
}

export const translationStringsSynchronizationService = new TranslationStringsSynchronizationService();
