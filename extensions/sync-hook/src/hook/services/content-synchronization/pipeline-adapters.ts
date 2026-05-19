import { SchemaOverview } from '@directus/types';
import {
  AutomatedExportContentDispatcher,
  AutomatedExportContentFetcher,
  AutomatedExportLocalazyContextLoader,
} from '../../../../../common/services/orchestrator/automated-export-pipeline';
import { SourceLanguageImportContentFetcher } from '../../../../../common/services/orchestrator/automated-deprecation-pipeline';
import { Settings } from '../../../../../common/models/collections-data/settings';
import { ContentTransferSetupDatabase } from '../../../../../common/models/collections-data/content-transfer-setup';
import { LocalazyData } from '../../../../../common/models/collections-data/localazy-data';
import { EnabledFieldsService } from '../../../../../common/utilities/enabled-fields-service';
import { DirectusLocalazyAdapter } from '../../../../../common/services/directus-localazy-adapter';
import { trackLocalazyError, trackDirectusError } from '../../functions/track-error';
import { ApiTranslatableCollectionsService } from '../translatable-collections-service';
import { ExportToLocalazyService } from '../export-to-localazy-service';
import { importFromLocalazyService } from '../import-from-localazy-service';
import { TranslationStringsService } from '../../../../../common/services/translation-strings-service';
import { DirectusApiService } from '../directus-service';
import { LOCALAZY_COLLECTIONS } from '../../../../../common/models/collections-data/collection-names';
import type { FieldsServiceCtor, ItemsServiceCtor } from '../../types/directus-services';

/**
 * Builds the `loadContext` adapter for the Automated export / deprecation pipelines.
 * Loads `localazy_settings`, `localazy_content_transfer_setup`, and `localazy_config_data`
 * with administrator permissions (`accountability: null`) so the triggering user's row
 * permissions don't gate sync. Returns `null` when the Localazy collections aren't yet
 * provisioned in the schema, when the IO call fails, or when any of the three rows is
 * missing.
 *
 * The schema guard must cover every collection we then read. The installer creates the
 * Localazy collections one at a time and seeds each singleton's row before moving on,
 * so each PATCH fires an `items.create` event with a schema snapshot that only contains
 * the collections created so far. Guarding only the first two would let the handler run
 * between "contentTransferSetup seeded" and "config created", and `new ItemsService(config, …)`
 * then throws `Cannot read properties of undefined (reading 'primary')` inside Directus'
 * schema traversal.
 */
export function makeBundleLocalazyContextLoader(deps: {
  ItemsService: ItemsServiceCtor;
  schema: SchemaOverview;
}): AutomatedExportLocalazyContextLoader {
  return async () => {
    const { ItemsService, schema } = deps;
    if (
      !schema.collections?.[LOCALAZY_COLLECTIONS.settings] ||
      !schema.collections?.[LOCALAZY_COLLECTIONS.contentTransferSetup] ||
      !schema.collections?.[LOCALAZY_COLLECTIONS.config]
    ) {
      return null;
    }
    try {
      const settingsService = new ItemsService<Settings>(LOCALAZY_COLLECTIONS.settings, { schema, accountability: null });
      const transferSetupService = new ItemsService<ContentTransferSetupDatabase>(LOCALAZY_COLLECTIONS.contentTransferSetup, {
        schema,
        accountability: null,
      });
      const localazyDataService = new ItemsService<LocalazyData>(LOCALAZY_COLLECTIONS.config, { schema, accountability: null });

      const [settings = null] = await settingsService.readByQuery({ fields: ['*'], limit: 1 });
      const [contentTransferSetup = null] = await transferSetupService.readByQuery({ fields: ['*'], limit: 1 });
      const [localazyData = null] = await localazyDataService.readByQuery({ fields: ['*'], limit: 1 });

      if (!settings || !contentTransferSetup || !localazyData) {
        return null;
      }
      return { settings, contentTransferSetup, localazyData };
    } catch (e: unknown) {
      trackLocalazyError(e, 'loadBundleLocalazyContext');
      return null;
    }
  };
}

/**
 * Builds the export-pipeline `fetchContent` strategy for the collection-items path.
 * Closes over per-event `keys` + `collection` so the pipeline-facing signature stays the
 * generic `(input) => Promise<TranslatableContent>`.
 *
 * `ApiTranslatableCollectionsService` already swallows internal errors and returns
 * empty content, preserving the legacy "Nothing to export" fallback for fetch failures.
 */
export function makeCollectionContentFetcher(deps: {
  ItemsService: ItemsServiceCtor;
  FieldsService: FieldsServiceCtor;
  schema: SchemaOverview;
  keys: string[];
  collection: string;
}): AutomatedExportContentFetcher {
  return async ({ context, exportLanguages }) => {
    const service = new ApiTranslatableCollectionsService(deps.ItemsService, deps.schema, deps.FieldsService);
    return service.fetchContentFromTranslatableCollections({
      translatableCollections: [{ collection: deps.collection, itemIds: deps.keys }],
      languages: exportLanguages,
      enabledFields: EnabledFieldsService.parseFromDatabase(context.contentTransferSetup.enabled_fields),
      settings: context.settings,
    });
  };
}

/**
 * Builds the export-pipeline `fetchContent` strategy for the translation-strings path.
 * Preserves the legacy try/catch + `trackDirectusError(e, 'fetchTranslationStrings')` so
 * fetch failures still surface in telemetry while the pipeline's outcome stays
 * `nothing-to-export` (matching legacy behaviour).
 */
export function makeTranslationStringsFetcher(deps: {
  ItemsService: ItemsServiceCtor;
  schema: SchemaOverview;
}): AutomatedExportContentFetcher {
  return async ({ context, exportLanguages }) => {
    const translationStringsService = new TranslationStringsService(new DirectusApiService(deps.ItemsService, deps.schema));
    try {
      return await translationStringsService.fetchTranslationStrings({
        languages: exportLanguages,
        settings: context.settings,
        synchronizeTranslationStrings: context.contentTransferSetup.translation_strings,
      });
    } catch (e: unknown) {
      trackDirectusError(e, 'fetchTranslationStrings');
      return { sourceLanguage: {}, otherLanguages: {} };
    }
  };
}

/**
 * Dispatch adapter for the Automated export pipeline. Wraps the existing
 * `ExportToLocalazyService` so the pipeline doesn't need to know its constructor or
 * payload shape.
 */
export const dispatchToLocalazy: AutomatedExportContentDispatcher = async ({ content, context, localazyProject }) => {
  const exportToLocalazyService = new ExportToLocalazyService();
  await exportToLocalazyService.exportContentToLocalazy({
    content,
    settings: context.settings,
    localazyData: context.localazyData,
    localazyProject,
  });
};

/**
 * Builds the deprecation-pipeline `fetchSourceLanguageImportContent` adapter. Requests
 * Localazy keys in the project's source language only — the projector below maps the
 * deleted Directus item ids to per-language key ids using `translationString.localazyKeys`
 * / `collectionItem.localazyKey`, so we don't need to fetch other languages here.
 */
export function makeSourceLanguageImportContentFetcher(): SourceLanguageImportContentFetcher {
  return async ({ context, localazyProject }) => {
    const sourceLocale = DirectusLocalazyAdapter.resolveLocalazyLanguageId(localazyProject.sourceLanguage);
    const sourceLanguageCode = sourceLocale?.locale || '';
    return importFromLocalazyService.importContentFromLocalazy({
      languages: [{ originalForm: sourceLanguageCode, localazyForm: sourceLanguageCode, directusForm: '' }],
      localazyData: context.localazyData,
      localazyProject,
      enabledFields: EnabledFieldsService.parseFromDatabase(context.contentTransferSetup.enabled_fields),
      progressCallbacks: {
        nothingToImport: () => trackLocalazyError(new Error('Nothing to import'), 'fetchSourceLanguageImportContent'),
        couldNotFetchContent: (language) =>
          trackLocalazyError(new Error(`Couldn't fetch content for ${language}`), 'fetchSourceLanguageImportContent'),
      },
    });
  };
}
