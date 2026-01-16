import { defineHook } from '@directus/extensions-sdk';
import { translationStringsSynchronizationService } from './services/content-synchronization/translation-strings-synchronization-service';
import { collectionContentSynchronizationService } from './services/content-synchronization/collection-content-synchronization-service';

export default defineHook(({ action }, { services, logger }) => {
  const { ItemsService, FieldsService } = services;

  action('settings.update', async (_, { schema }) => {
    if (schema) {
      await translationStringsSynchronizationService.exportTranslationString({
        schema,
        logger,
        ItemsService,
      });
    }
  });

  action('settings.create', async (_, { schema }) => {
    if (schema) {
      await translationStringsSynchronizationService.exportTranslationString({
        schema,
        logger,
        ItemsService,
      });
    }
  });

  action('settings.delete', async ({ keys }, { schema }) => {
    if (schema && keys.length > 0) {
      try {
        await translationStringsSynchronizationService.deprecateDeletedTranslationStrings({
          schema,
          logger,
          itemIds: keys,
          ItemsService,
        });
      } catch (e) {
        // In Directus 11+, delete hook fires before permission checks
        // Item might not have been deleted if permission was denied
        logger.warn(`[Localazy] Could not deprecate settings: ${e}`);
      }
    }
  });

  action('translations.update', async (_, { schema }) => {
    if (schema) {
      await translationStringsSynchronizationService.exportTranslationString({
        schema,
        logger,
        ItemsService,
      });
    }
  });

  action('translations.create', async (_, { schema }) => {
    if (schema) {
      translationStringsSynchronizationService.exportTranslationString({
        schema,
        logger,
        ItemsService,
      });
    }
  });

  action('translations.delete', async ({ keys }, { schema }) => {
    if (schema && keys.length > 0) {
      try {
        await translationStringsSynchronizationService.deprecateDeletedTranslationStrings({
          schema,
          logger,
          itemIds: keys,
          ItemsService,
        });
      } catch (e) {
        // In Directus 11+, delete hook fires before permission checks
        // Item might not have been deleted if permission was denied
        logger.warn(`[Localazy] Could not deprecate translations: ${e}`);
      }
    }
  });

  action('items.update', async ({ keys, collection }, { schema }) => {
    if (schema) {
      await collectionContentSynchronizationService.exportCollectionContent({
        schema,
        ItemsService,
        FieldsService,
        logger,
        keys,
        collection,
      });
    }
  });

  action('items.delete', async ({ keys, collection }, { schema }) => {
    if (schema && keys.length > 0) {
      try {
        await collectionContentSynchronizationService.deprecateDeletedCollectionItems({
          schema,
          collection,
          logger,
          itemIds: keys,
          ItemsService,
        });
      } catch (e) {
        // In Directus 11+, delete hook fires before permission checks
        // Item might not have been deleted if permission was denied
        logger.warn(`[Localazy] Could not deprecate items in ${collection}: ${e}`);
      }
    }
  });

  action('items.create', async ({ key, collection }, { schema }) => {
    if (schema) {
      await collectionContentSynchronizationService.exportCollectionContent({
        schema,
        ItemsService,
        FieldsService,
        logger,
        keys: [key],
        collection,
      });
    }
  });
});
