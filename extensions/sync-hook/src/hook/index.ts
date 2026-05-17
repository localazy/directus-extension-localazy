import { defineHook } from '@directus/extensions-sdk';
import { runAutomatedExportPipeline } from '../../../common/services/orchestrator/automated-export-pipeline';
import { runAutomatedDeprecationPipeline } from '../../../common/services/orchestrator/automated-deprecation-pipeline';
import {
  dispatchToLocalazy,
  makeBundleLocalazyContextLoader,
  makeCollectionContentFetcher,
  makeSourceLanguageImportContentFetcher,
  makeTranslationStringsFetcher,
} from './services/content-synchronization/pipeline-adapters';
import {
  projectCollectionDeprecationKeys,
  projectTranslationStringsDeprecationKeys,
} from './services/content-synchronization/deprecation-key-projectors';
import { reportAutomatedDeprecationOutcome, reportAutomatedExportOutcome } from './services/content-synchronization/outcome-reporters';
import { DirectusApiService } from './services/directus-service';

const EXPORT_TRANSLATION_STRINGS_EVENTS = ['settings.create', 'settings.update', 'translations.create', 'translations.update'] as const;

const DEPRECATE_TRANSLATION_STRINGS_EVENTS = ['settings.delete', 'translations.delete'] as const;

const EXPORT_COLLECTION_CONTENT_EVENTS = ['items.create', 'items.update'] as const;

export default defineHook(({ action }, { services, logger }) => {
  const { ItemsService, FieldsService } = services;

  // Settings + translation-string create/update: export translatable strings to Localazy.
  for (const event of EXPORT_TRANSLATION_STRINGS_EVENTS) {
    action(event, async (_, { schema }) => {
      if (!schema) return;
      const outcome = await runAutomatedExportPipeline({
        loadContext: makeBundleLocalazyContextLoader({ ItemsService, schema }),
        directusApi: new DirectusApiService(ItemsService, schema),
        fetchContent: makeTranslationStringsFetcher({ ItemsService, schema }),
        dispatchContent: dispatchToLocalazy,
      });
      reportAutomatedExportOutcome({ outcome, logger, label: 'translation strings', trackingLabel: 'exportTranslationString' });
    });
  }

  // Settings + translation-string delete: deprecate matching Localazy keys.
  for (const event of DEPRECATE_TRANSLATION_STRINGS_EVENTS) {
    action(event, async ({ keys }, { schema }) => {
      if (!schema) return;
      const outcome = await runAutomatedDeprecationPipeline({
        itemIds: keys,
        loadContext: makeBundleLocalazyContextLoader({ ItemsService, schema }),
        fetchSourceLanguageImportContent: makeSourceLanguageImportContentFetcher(),
        projectDeprecationKeys: projectTranslationStringsDeprecationKeys,
      });
      reportAutomatedDeprecationOutcome({
        outcome,
        logger,
        label: 'translation strings',
        trackingLabel: 'deprecateDeletedTranslationStrings',
      });
    });
  }

  // Items create/update: export collection content. The create event delivers
  // a single `key`; update delivers a `keys` array. Normalise to keys[].
  for (const event of EXPORT_COLLECTION_CONTENT_EVENTS) {
    action(event, async (payload, { schema }) => {
      if (!schema) return;
      const keys: string[] = 'keys' in payload ? payload.keys : [payload.key];
      const outcome = await runAutomatedExportPipeline({
        loadContext: makeBundleLocalazyContextLoader({ ItemsService, schema }),
        directusApi: new DirectusApiService(ItemsService, schema),
        fetchContent: makeCollectionContentFetcher({ ItemsService, FieldsService, schema, keys, collection: payload.collection }),
        dispatchContent: dispatchToLocalazy,
      });
      reportAutomatedExportOutcome({
        outcome,
        logger,
        label: `${payload.collection} content for keys ${keys.join(', ')}`,
        trackingLabel: 'exportCollectionContent',
      });
    });
  }

  // Items delete: deprecate the matching Localazy keys.
  action('items.delete', async ({ keys, collection }, { schema }) => {
    if (!schema) return;
    const outcome = await runAutomatedDeprecationPipeline({
      itemIds: keys,
      loadContext: makeBundleLocalazyContextLoader({ ItemsService, schema }),
      fetchSourceLanguageImportContent: makeSourceLanguageImportContentFetcher(),
      projectDeprecationKeys: projectCollectionDeprecationKeys(collection),
    });
    reportAutomatedDeprecationOutcome({
      outcome,
      logger,
      label: `collection ${collection}`,
      trackingLabel: 'deprecateDeletedCollectionItems',
    });
  });
});
