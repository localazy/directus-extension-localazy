import { defineHook } from '@directus/extensions-sdk';
import { translationStringsSynchronizationService } from './services/content-synchronization/translation-strings-synchronization-service';
import { collectionContentSynchronizationService } from './services/content-synchronization/collection-content-synchronization-service';

const EXPORT_TRANSLATION_STRINGS_EVENTS = ['settings.create', 'settings.update', 'translations.create', 'translations.update'] as const;

const DEPRECATE_TRANSLATION_STRINGS_EVENTS = ['settings.delete', 'translations.delete'] as const;

const EXPORT_COLLECTION_CONTENT_EVENTS = ['items.create', 'items.update'] as const;

export default defineHook(({ action }, { services, logger }) => {
  const { ItemsService, FieldsService } = services;

  // Settings + translation-string create/update: export translatable strings to Localazy.
  for (const event of EXPORT_TRANSLATION_STRINGS_EVENTS) {
    action(event, async (_, { schema }) => {
      if (!schema) return;
      await translationStringsSynchronizationService.exportTranslationString({
        schema,
        logger,
        ItemsService,
      });
    });
  }

  // Settings + translation-string delete: deprecate matching Localazy keys.
  for (const event of DEPRECATE_TRANSLATION_STRINGS_EVENTS) {
    action(event, async ({ keys }, { schema }) => {
      if (!schema) return;
      await translationStringsSynchronizationService.deprecateDeletedTranslationStrings({
        schema,
        logger,
        itemIds: keys,
        ItemsService,
      });
    });
  }

  // Items create/update: export collection content. The create event delivers
  // a single `key`; update delivers a `keys` array. Normalise to keys[].
  for (const event of EXPORT_COLLECTION_CONTENT_EVENTS) {
    action(event, async (payload, { schema }) => {
      if (!schema) return;
      const keys = 'keys' in payload ? payload.keys : [payload.key];
      await collectionContentSynchronizationService.exportCollectionContent({
        schema,
        ItemsService,
        FieldsService,
        logger,
        keys,
        collection: payload.collection,
      });
    });
  }

  // Items delete: deprecate the matching Localazy keys.
  action('items.delete', async ({ keys, collection }, { schema }) => {
    if (!schema) return;
    await collectionContentSynchronizationService.deprecateDeletedCollectionItems({
      schema,
      collection,
      logger,
      itemIds: keys,
      ItemsService,
    });
  });
});
