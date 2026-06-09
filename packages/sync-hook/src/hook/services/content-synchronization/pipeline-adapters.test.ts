import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SchemaOverview } from '@directus/types';
import { Project } from '@localazy/api-client';
import { Settings } from '@localazy/directus-common';
import { ContentTransferSetupDatabase } from '@localazy/directus-common';
import { LocalazyData } from '@localazy/directus-common';
import { LocalazyContent } from '@localazy/directus-common';
import { TranslatableContent } from '@localazy/directus-common';
import type { DirectusLogger, FieldsServiceCtor, ItemsServiceCtor } from '../../types/directus-services';

const fakeLogger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } as unknown as DirectusLogger;

const trackMocks = vi.hoisted(() => ({
  trackLocalazyError: vi.fn(),
  trackDirectusError: vi.fn(),
}));
vi.mock('../../functions/track-error', () => ({
  trackLocalazyError: trackMocks.trackLocalazyError,
  trackDirectusError: trackMocks.trackDirectusError,
}));

const serviceMocks = vi.hoisted(() => ({
  fetchContentFromTranslatableCollections: vi.fn(),
  fetchTranslationStrings: vi.fn(),
  exportContentToLocalazy: vi.fn().mockResolvedValue(undefined),
  importContentFromLocalazy: vi.fn(),
  resolveLocalazyLanguageId: vi.fn(),
}));

vi.mock('../translatable-collections-service', () => ({
  ApiTranslatableCollectionsService: class {
    fetchContentFromTranslatableCollections = serviceMocks.fetchContentFromTranslatableCollections;
  },
}));
vi.mock('../export-to-localazy-service', () => ({
  ExportToLocalazyService: class {
    exportContentToLocalazy = serviceMocks.exportContentToLocalazy;
  },
}));
vi.mock('../import-from-localazy-service', () => ({
  importFromLocalazyService: { importContentFromLocalazy: serviceMocks.importContentFromLocalazy },
}));
vi.mock('../../../../../common/src/services/translation-strings-service', () => ({
  TranslationStringsService: class {
    fetchTranslationStrings = serviceMocks.fetchTranslationStrings;
  },
}));
vi.mock('../../../../../common/src/services/directus-localazy-adapter', () => ({
  DirectusLocalazyAdapter: { resolveLocalazyLanguageId: serviceMocks.resolveLocalazyLanguageId },
}));
vi.mock('../directus-service', () => ({
  DirectusApiService: class {
    tag = 'directus-api-service';
  },
}));

import {
  makeBundleLocalazyContextLoader,
  makeCollectionContentFetcher,
  makeDispatchToLocalazy,
  makeSourceLanguageImportContentFetcher,
  makeTranslationStringsFetcher,
} from './pipeline-adapters';

const sampleSettings = { automated_upload: true, source_language: 'en' } as Settings;
const sampleTransferSetup = { enabled_fields: '[]', translation_strings: true } as ContentTransferSetupDatabase;
const sampleLocalazyData = { access_token: 'tok' } as LocalazyData;
const sampleProject = { id: 'p1', sourceLanguage: 1 } as Project;
const okContent: TranslatableContent = { sourceLanguage: { en: { hello: 'Hi' } }, otherLanguages: {} };

const schemaWithLocalazyCollections = {
  collections: {
    localazy_settings: {},
    localazy_content_transfer_setup: {},
    localazy_config_data: {},
  },
} as unknown as SchemaOverview;

const emptySchema = { collections: {} } as unknown as SchemaOverview;

/**
 * Builds an ItemsService constructor stub. Per-collection responses are looked up in
 * `rowsByCollection` (one row each, returned wrapped in an array as `readByQuery` does);
 * a missing key yields an empty array, simulating "row not present in db".
 */
function makeItemsServiceCtor(
  rowsByCollection: Partial<Record<string, unknown>>,
  options: { throwOnCollection?: string } = {},
): ItemsServiceCtor {
  // vitest requires `function` or `class` in the mock implementation for `new` calls —
  // an arrow-function impl returns undefined when called with `new`.
  return vi.fn().mockImplementation(function (this: unknown, collection: string) {
    return {
      readByQuery: () => {
        if (options.throwOnCollection === collection) {
          return Promise.reject(new Error('IO error reading ' + collection));
        }
        const row = rowsByCollection[collection];
        return Promise.resolve(row === undefined ? [] : [row]);
      },
    };
  }) as unknown as ItemsServiceCtor;
}

describe('makeBundleLocalazyContextLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when localazy_settings collection is missing from the schema', async () => {
    const ItemsService = makeItemsServiceCtor({});
    const loader = makeBundleLocalazyContextLoader({ ItemsService, schema: emptySchema, logger: fakeLogger });

    const result = await loader();

    expect(result).toBeNull();
    expect(ItemsService).not.toHaveBeenCalled();
    expect(trackMocks.trackLocalazyError).not.toHaveBeenCalled();
  });

  it('returns null when localazy_content_transfer_setup is missing but localazy_settings is present', async () => {
    const partialSchema = { collections: { localazy_settings: {} } } as unknown as SchemaOverview;
    const ItemsService = makeItemsServiceCtor({});

    const result = await makeBundleLocalazyContextLoader({ ItemsService, schema: partialSchema, logger: fakeLogger })();

    expect(result).toBeNull();
    expect(ItemsService).not.toHaveBeenCalled();
  });

  // Closes the install-time race: the installer creates collections sequentially and seeds
  // each singleton's row before moving on, so the `items.create` event for the
  // content-transfer-setup seed fires with a schema that includes settings +
  // contentTransferSetup but not yet config. Without this guard, `new ItemsService(config, …)`
  // throws inside Directus' schema traversal.
  it('returns null when localazy_config_data is missing but the other two are present', async () => {
    const partialSchema = {
      collections: { localazy_settings: {}, localazy_content_transfer_setup: {} },
    } as unknown as SchemaOverview;
    const ItemsService = makeItemsServiceCtor({});

    const result = await makeBundleLocalazyContextLoader({ ItemsService, schema: partialSchema, logger: fakeLogger })();

    expect(result).toBeNull();
    expect(ItemsService).not.toHaveBeenCalled();
  });

  it('returns null when the settings row is missing', async () => {
    const ItemsService = makeItemsServiceCtor({
      localazy_content_transfer_setup: sampleTransferSetup,
      localazy_config_data: sampleLocalazyData,
    });

    const result = await makeBundleLocalazyContextLoader({ ItemsService, schema: schemaWithLocalazyCollections, logger: fakeLogger })();

    expect(result).toBeNull();
  });

  it('returns null when the content_transfer_setup row is missing', async () => {
    const ItemsService = makeItemsServiceCtor({
      localazy_settings: sampleSettings,
      localazy_config_data: sampleLocalazyData,
    });

    const result = await makeBundleLocalazyContextLoader({ ItemsService, schema: schemaWithLocalazyCollections, logger: fakeLogger })();

    expect(result).toBeNull();
  });

  it('returns null when the localazy_data row is missing', async () => {
    const ItemsService = makeItemsServiceCtor({
      localazy_settings: sampleSettings,
      localazy_content_transfer_setup: sampleTransferSetup,
    });

    const result = await makeBundleLocalazyContextLoader({ ItemsService, schema: schemaWithLocalazyCollections, logger: fakeLogger })();

    expect(result).toBeNull();
  });

  it('returns null + tracks the error when a read throws', async () => {
    const ItemsService = makeItemsServiceCtor(
      {
        localazy_settings: sampleSettings,
        localazy_content_transfer_setup: sampleTransferSetup,
        localazy_config_data: sampleLocalazyData,
      },
      { throwOnCollection: 'localazy_config_data' },
    );

    const result = await makeBundleLocalazyContextLoader({ ItemsService, schema: schemaWithLocalazyCollections, logger: fakeLogger })();

    expect(result).toBeNull();
    expect(trackMocks.trackLocalazyError).toHaveBeenCalledOnce();
    expect(trackMocks.trackLocalazyError.mock.calls[0]![0]).toBe(fakeLogger);
    expect(trackMocks.trackLocalazyError.mock.calls[0]![2]).toBe('loadBundleLocalazyContext');
  });

  it('reads all three Localazy collections with accountability=null and returns the resolved context', async () => {
    const ItemsService = makeItemsServiceCtor({
      localazy_settings: sampleSettings,
      localazy_content_transfer_setup: sampleTransferSetup,
      localazy_config_data: sampleLocalazyData,
    });

    const result = await makeBundleLocalazyContextLoader({ ItemsService, schema: schemaWithLocalazyCollections, logger: fakeLogger })();

    expect(result).toEqual({
      settings: sampleSettings,
      contentTransferSetup: sampleTransferSetup,
      localazyData: sampleLocalazyData,
    });
    // All three constructor calls passed accountability=null so the read uses admin permissions.
    const ctorMock = ItemsService as unknown as ReturnType<typeof vi.fn>;
    expect(ctorMock).toHaveBeenCalledTimes(3);
    for (const call of ctorMock.mock.calls) {
      expect(call[1]).toMatchObject({ accountability: null });
    }
  });
});

describe('makeCollectionContentFetcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes collection + itemIds + enabledFields + exportLanguages through to the underlying service', async () => {
    const enabledFields = '[{"collection":"articles","fields":["title"]}]';
    const ctx = {
      settings: sampleSettings,
      contentTransferSetup: { ...sampleTransferSetup, enabled_fields: enabledFields } as ContentTransferSetupDatabase,
      localazyData: sampleLocalazyData,
    };
    serviceMocks.fetchContentFromTranslatableCollections.mockResolvedValue(okContent);

    const fetcher = makeCollectionContentFetcher({
      ItemsService: vi.fn() as unknown as ItemsServiceCtor,
      FieldsService: vi.fn() as unknown as FieldsServiceCtor,
      schema: schemaWithLocalazyCollections,
      keys: ['a1', 'a2'],
      collection: 'articles',
      logger: fakeLogger,
    });
    const result = await fetcher({ context: ctx, localazyProject: sampleProject, exportLanguages: ['en', 'de'] });

    expect(result).toBe(okContent);
    expect(serviceMocks.fetchContentFromTranslatableCollections).toHaveBeenCalledExactlyOnceWith({
      translatableCollections: [{ collection: 'articles', itemIds: ['a1', 'a2'] }],
      languages: ['en', 'de'],
      enabledFields: [{ collection: 'articles', fields: ['title'] }],
      settings: sampleSettings,
    });
  });
});

describe('makeTranslationStringsFetcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes settings + languages + the translation_strings flag through', async () => {
    serviceMocks.fetchTranslationStrings.mockResolvedValue(okContent);

    const fetcher = makeTranslationStringsFetcher({
      ItemsService: vi.fn() as unknown as ItemsServiceCtor,
      schema: schemaWithLocalazyCollections,
      logger: fakeLogger,
    });
    const ctx = { settings: sampleSettings, contentTransferSetup: sampleTransferSetup, localazyData: sampleLocalazyData };
    const result = await fetcher({ context: ctx, localazyProject: sampleProject, exportLanguages: ['en'] });

    expect(result).toBe(okContent);
    expect(serviceMocks.fetchTranslationStrings).toHaveBeenCalledExactlyOnceWith({
      languages: ['en'],
      settings: sampleSettings,
      synchronizeTranslationStrings: true,
    });
  });

  // Legacy parity: the subclass swallowed fetch errors so the pipeline saw empty content
  // and returned `nothing-to-export` rather than `failed`. The adapter preserves that.
  it('returns empty content + tracks the error when fetchTranslationStrings throws', async () => {
    const fetchError = new Error('boom');
    serviceMocks.fetchTranslationStrings.mockRejectedValue(fetchError);

    const fetcher = makeTranslationStringsFetcher({
      ItemsService: vi.fn() as unknown as ItemsServiceCtor,
      schema: schemaWithLocalazyCollections,
      logger: fakeLogger,
    });
    const ctx = { settings: sampleSettings, contentTransferSetup: sampleTransferSetup, localazyData: sampleLocalazyData };
    const result = await fetcher({ context: ctx, localazyProject: sampleProject, exportLanguages: ['en'] });

    expect(result).toEqual({ sourceLanguage: {}, otherLanguages: {} });
    expect(trackMocks.trackDirectusError).toHaveBeenCalledExactlyOnceWith(fakeLogger, fetchError, 'fetchTranslationStrings');
  });
});

describe('makeDispatchToLocalazy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('unpacks context into settings + localazyData and forwards content + localazyProject', async () => {
    const ctx = { settings: sampleSettings, contentTransferSetup: sampleTransferSetup, localazyData: sampleLocalazyData };

    await makeDispatchToLocalazy(fakeLogger)({ content: okContent, context: ctx, localazyProject: sampleProject });

    expect(serviceMocks.exportContentToLocalazy).toHaveBeenCalledExactlyOnceWith({
      content: okContent,
      settings: sampleSettings,
      localazyData: sampleLocalazyData,
      localazyProject: sampleProject,
    });
  });
});

describe('makeSourceLanguageImportContentFetcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves the project source language + requests it as a single-language import', async () => {
    serviceMocks.resolveLocalazyLanguageId.mockReturnValue({ locale: 'en' });
    const importContent: LocalazyContent = { translationStrings: new Map(), collections: new Map() };
    serviceMocks.importContentFromLocalazy.mockResolvedValue({ success: true, content: importContent });

    const ctx = {
      settings: sampleSettings,
      contentTransferSetup: {
        ...sampleTransferSetup,
        enabled_fields: '[{"collection":"articles","fields":["title"]}]',
      } as ContentTransferSetupDatabase,
      localazyData: sampleLocalazyData,
    };
    const result = await makeSourceLanguageImportContentFetcher(fakeLogger)({ context: ctx, localazyProject: sampleProject });

    expect(result).toEqual({ success: true, content: importContent });
    expect(serviceMocks.resolveLocalazyLanguageId).toHaveBeenCalledWith(sampleProject.sourceLanguage);
    expect(serviceMocks.importContentFromLocalazy).toHaveBeenCalledExactlyOnceWith({
      logger: fakeLogger,
      languages: [{ originalForm: 'en', localazyForm: 'en', directusForm: '' }],
      localazyData: sampleLocalazyData,
      localazyProject: sampleProject,
      enabledFields: [{ collection: 'articles', fields: ['title'] }],
      progressCallbacks: { nothingToImport: expect.any(Function), couldNotFetchContent: expect.any(Function) },
    });
  });

  it("falls back to an empty source-language code when DirectusLocalazyAdapter can't resolve the project locale", async () => {
    serviceMocks.resolveLocalazyLanguageId.mockReturnValue(null);
    serviceMocks.importContentFromLocalazy.mockResolvedValue({ success: false });

    const ctx = { settings: sampleSettings, contentTransferSetup: sampleTransferSetup, localazyData: sampleLocalazyData };
    await makeSourceLanguageImportContentFetcher(fakeLogger)({ context: ctx, localazyProject: sampleProject });

    expect(serviceMocks.importContentFromLocalazy.mock.calls[0]![0].languages).toEqual([
      { originalForm: '', localazyForm: '', directusForm: '' },
    ]);
  });
});
