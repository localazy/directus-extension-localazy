import { randomUUID } from 'node:crypto';
import { defineHook } from '@directus/extensions-sdk';
import { runAutomatedExportPipeline } from '@localazy/directus-common';
import { runAutomatedDeprecationPipeline } from '@localazy/directus-common';
import {
  makeBundleLocalazyContextLoader,
  makeCollectionContentFetcher,
  makeDispatchToLocalazy,
  makeSourceLanguageImportContentFetcher,
  makeTranslationStringsFetcher,
} from './services/content-synchronization/pipeline-adapters';
import {
  projectCollectionDeprecationKeys,
  projectTranslationStringsDeprecationKeys,
} from './services/content-synchronization/deprecation-key-projectors';
import { reportAutomatedDeprecationOutcome, reportAutomatedExportOutcome } from './services/content-synchronization/outcome-reporters';
import { createAutomatedExportBurstCoordinator } from './services/automated-export-burst-coordinator';
import { DirectusApiService } from './services/directus-service';

const EXPORT_TRANSLATION_STRINGS_EVENTS = ['settings.create', 'settings.update', 'translations.create', 'translations.update'] as const;

const DEPRECATE_TRANSLATION_STRINGS_EVENTS = ['settings.delete', 'translations.delete'] as const;

const EXPORT_COLLECTION_CONTENT_EVENTS = ['items.create', 'items.update'] as const;

export default defineHook(({ action }, { services, logger }) => {
  const { ItemsService, FieldsService } = services;

  // Process-singleton burst coordinator. Captures the bundle's `ItemsService` ref + a
  // node:crypto UUID factory; per-event schemas thread through each `record…Outcome`
  // call. The coordinator is purely additive — the existing `reportAutomated…Outcome`
  // calls still route to Directus' logger + analytics; the coordinator adds the
  // persistent Activity-page surface on top. ADR-0002 explains the burst lifecycle.
  const burstCoordinator = createAutomatedExportBurstCoordinator({
    ItemsService,
    generateId: randomUUID,
  });

  // Settings + translation-string create/update: export translatable strings to Localazy.
  for (const event of EXPORT_TRANSLATION_STRINGS_EVENTS) {
    action(event, async (_, { schema, accountability }) => {
      if (!schema) return;
      const outcome = await runAutomatedExportPipeline({
        loadContext: makeBundleLocalazyContextLoader({ ItemsService, schema, logger }),
        directusApi: new DirectusApiService(ItemsService, schema),
        fetchContent: makeTranslationStringsFetcher({ ItemsService, schema, logger }),
        dispatchContent: makeDispatchToLocalazy(logger),
      });
      reportAutomatedExportOutcome({ outcome, logger, label: 'translation strings', trackingLabel: 'exportTranslationString' });
      await burstCoordinator.recordExportOutcome({
        outcome,
        schema,
        event,
        collection: event.startsWith('settings.') ? 'directus_settings' : 'directus_translations',
        keys: [],
        userId: accountability?.user ?? null,
      });
    });
  }

  // Settings + translation-string delete: deprecate matching Localazy keys.
  for (const event of DEPRECATE_TRANSLATION_STRINGS_EVENTS) {
    action(event, async ({ keys }, { schema, accountability }) => {
      if (!schema) return;
      const outcome = await runAutomatedDeprecationPipeline({
        itemIds: keys,
        loadContext: makeBundleLocalazyContextLoader({ ItemsService, schema, logger }),
        fetchSourceLanguageImportContent: makeSourceLanguageImportContentFetcher(logger),
        projectDeprecationKeys: projectTranslationStringsDeprecationKeys,
      });
      reportAutomatedDeprecationOutcome({
        outcome,
        logger,
        label: 'translation strings',
        trackingLabel: 'deprecateDeletedTranslationStrings',
      });
      await burstCoordinator.recordDeprecationOutcome({
        outcome,
        schema,
        event,
        collection: event.startsWith('settings.') ? 'directus_settings' : 'directus_translations',
        keys,
        userId: accountability?.user ?? null,
      });
    });
  }

  // Items create/update: export collection content. The create event delivers
  // a single `key`; update delivers a `keys` array. Normalise to keys[].
  for (const event of EXPORT_COLLECTION_CONTENT_EVENTS) {
    action(event, async (payload, { schema, accountability }) => {
      if (!schema) return;
      const keys: string[] = 'keys' in payload ? payload.keys : [payload.key];
      const outcome = await runAutomatedExportPipeline({
        loadContext: makeBundleLocalazyContextLoader({ ItemsService, schema, logger }),
        directusApi: new DirectusApiService(ItemsService, schema),
        fetchContent: makeCollectionContentFetcher({ ItemsService, FieldsService, schema, keys, collection: payload.collection, logger }),
        dispatchContent: makeDispatchToLocalazy(logger),
      });
      reportAutomatedExportOutcome({
        outcome,
        logger,
        label: `${payload.collection} content for keys ${keys.join(', ')}`,
        trackingLabel: 'exportCollectionContent',
      });
      await burstCoordinator.recordExportOutcome({
        outcome,
        schema,
        event,
        collection: payload.collection,
        keys,
        userId: accountability?.user ?? null,
      });
    });
  }

  // Items delete: deprecate the matching Localazy keys.
  action('items.delete', async ({ keys, collection }, { schema, accountability }) => {
    if (!schema) return;
    const outcome = await runAutomatedDeprecationPipeline({
      itemIds: keys,
      loadContext: makeBundleLocalazyContextLoader({ ItemsService, schema, logger }),
      fetchSourceLanguageImportContent: makeSourceLanguageImportContentFetcher(logger),
      projectDeprecationKeys: projectCollectionDeprecationKeys(collection),
    });
    reportAutomatedDeprecationOutcome({
      outcome,
      logger,
      label: `collection ${collection}`,
      trackingLabel: 'deprecateDeletedCollectionItems',
    });
    await burstCoordinator.recordDeprecationOutcome({
      outcome,
      schema,
      event: 'items.delete',
      collection,
      keys,
      userId: accountability?.user ?? null,
    });
  });
});
