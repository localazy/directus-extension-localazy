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
    if (schema) {
      await translationStringsSynchronizationService.deprecateDeletedTranslationStrings({
        schema,
        logger,
        itemIds: keys,
        ItemsService,
      });
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
    if (schema) {
      await translationStringsSynchronizationService.deprecateDeletedTranslationStrings({
        schema,
        logger,
        itemIds: keys,
        ItemsService,
      });
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
    if (schema) {
      await collectionContentSynchronizationService.deprecateDeletedCollectionItems({
        schema,
        collection,
        logger,
        itemIds: keys,
        ItemsService,
      });
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
