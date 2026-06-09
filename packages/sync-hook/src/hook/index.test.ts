import { describe, it, expect, vi, beforeEach } from 'vitest';

// Captures every call into the export / deprecation pipelines so we can assert that the
// hook composes them correctly — what loadContext was passed, what fetcher closes over
// what keys, etc. The pipelines themselves have their own unit tests in
// extensions/common/services/orchestrator/.
const pipelineMocks = vi.hoisted(() => ({
  runAutomatedExportPipeline: vi.fn().mockResolvedValue({ kind: 'exported' }),
  runAutomatedDeprecationPipeline: vi.fn().mockResolvedValue({ kind: 'deprecated', keysCount: 0 }),
}));

const adapterMocks = vi.hoisted(() => ({
  loadContextFactory: vi.fn(),
  collectionContentFetcherFactory: vi.fn(),
  translationStringsFetcherFactory: vi.fn(),
  sourceLanguageImportContentFetcherFactory: vi.fn(),
  dispatchFactory: vi.fn(),
}));

const reporterMocks = vi.hoisted(() => ({
  reportAutomatedExportOutcome: vi.fn(),
  reportAutomatedDeprecationOutcome: vi.fn(),
}));

vi.mock('@directus/extensions-sdk', () => ({
  defineHook: (callback: unknown) => callback,
}));

vi.mock('../../../common/src/services/orchestrator/automated-export-pipeline', () => ({
  runAutomatedExportPipeline: pipelineMocks.runAutomatedExportPipeline,
}));

vi.mock('../../../common/src/services/orchestrator/automated-deprecation-pipeline', () => ({
  runAutomatedDeprecationPipeline: pipelineMocks.runAutomatedDeprecationPipeline,
}));

vi.mock('./services/content-synchronization/pipeline-adapters', () => ({
  makeBundleLocalazyContextLoader: adapterMocks.loadContextFactory.mockReturnValue('loadContextSentinel'),
  makeCollectionContentFetcher: adapterMocks.collectionContentFetcherFactory.mockReturnValue('collectionContentFetcherSentinel'),
  makeTranslationStringsFetcher: adapterMocks.translationStringsFetcherFactory.mockReturnValue('translationStringsFetcherSentinel'),
  makeSourceLanguageImportContentFetcher:
    adapterMocks.sourceLanguageImportContentFetcherFactory.mockReturnValue('sourceLanguageFetcherSentinel'),
  makeDispatchToLocalazy: adapterMocks.dispatchFactory.mockReturnValue('dispatchSentinel'),
}));

vi.mock('./services/content-synchronization/deprecation-key-projectors', () => ({
  projectCollectionDeprecationKeys: vi.fn((collection: string) => ({ tag: 'collection-projector', collection })),
  projectTranslationStringsDeprecationKeys: { tag: 'translation-strings-projector' },
}));

vi.mock('./services/content-synchronization/outcome-reporters', () => ({
  reportAutomatedExportOutcome: reporterMocks.reportAutomatedExportOutcome,
  reportAutomatedDeprecationOutcome: reporterMocks.reportAutomatedDeprecationOutcome,
}));

vi.mock('./services/directus-service', () => ({
  // Constructor produces a sentinel object the assertions can match by structural shape.
  DirectusApiService: class {
    tag = 'directus-api-service-sentinel';
  },
}));

import hookCallback from './index';

type HandlerMeta = Record<string, unknown>;
type Handler = (meta: HandlerMeta, ctx: { schema: unknown }) => Promise<void> | void;

describe('sync-hook entry point', () => {
  let registrations: Map<string, Handler>;
  const fakeSchema = { collections: {} };
  const fakeItemsService = vi.fn();
  const fakeFieldsService = vi.fn();
  const fakeLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    // vi.clearAllMocks resets the chained mockReturnValue too — re-arm the factories.
    adapterMocks.loadContextFactory.mockReturnValue('loadContextSentinel');
    adapterMocks.collectionContentFetcherFactory.mockReturnValue('collectionContentFetcherSentinel');
    adapterMocks.translationStringsFetcherFactory.mockReturnValue('translationStringsFetcherSentinel');
    adapterMocks.sourceLanguageImportContentFetcherFactory.mockReturnValue('sourceLanguageFetcherSentinel');
    adapterMocks.dispatchFactory.mockReturnValue('dispatchSentinel');
    pipelineMocks.runAutomatedExportPipeline.mockResolvedValue({ kind: 'exported' });
    pipelineMocks.runAutomatedDeprecationPipeline.mockResolvedValue({ kind: 'deprecated', keysCount: 0 });
    registrations = new Map();

    const action = (event: string, handler: Handler) => {
      registrations.set(event, handler);
    };
    const registerContext = { action, filter: vi.fn(), init: vi.fn(), schedule: vi.fn(), embed: vi.fn() };
    const apiContext = {
      services: { ItemsService: fakeItemsService, FieldsService: fakeFieldsService },
      logger: fakeLogger,
    };
    (hookCallback as unknown as (r: typeof registerContext, c: typeof apiContext) => void)(registerContext, apiContext);
  });

  it('registers handlers for all 9 documented lifecycle events', () => {
    const expectedEvents = [
      'settings.create',
      'settings.update',
      'settings.delete',
      'translations.create',
      'translations.update',
      'translations.delete',
      'items.create',
      'items.update',
      'items.delete',
    ];
    for (const event of expectedEvents) {
      expect(registrations.has(event), `missing handler for ${event}`).toBe(true);
    }
  });

  it('does not register handlers for events outside the documented set', () => {
    expect(registrations.size).toBe(9);
  });

  describe('translation-strings export events', () => {
    for (const event of ['settings.create', 'settings.update', 'translations.create', 'translations.update']) {
      it(`${event} composes the export pipeline with the translation-strings fetcher`, async () => {
        await registrations.get(event)!({ keys: ['k1'] }, { schema: fakeSchema });

        expect(adapterMocks.loadContextFactory).toHaveBeenCalledWith({
          ItemsService: fakeItemsService,
          schema: fakeSchema,
          logger: fakeLogger,
        });
        expect(adapterMocks.translationStringsFetcherFactory).toHaveBeenCalledWith({
          ItemsService: fakeItemsService,
          schema: fakeSchema,
          logger: fakeLogger,
        });
        expect(adapterMocks.dispatchFactory).toHaveBeenCalledWith(fakeLogger);
        expect(pipelineMocks.runAutomatedExportPipeline).toHaveBeenCalledExactlyOnceWith({
          loadContext: 'loadContextSentinel',
          directusApi: { tag: 'directus-api-service-sentinel' },
          fetchContent: 'translationStringsFetcherSentinel',
          dispatchContent: 'dispatchSentinel',
        });
        expect(reporterMocks.reportAutomatedExportOutcome).toHaveBeenCalledExactlyOnceWith({
          outcome: { kind: 'exported' },
          logger: fakeLogger,
          label: 'translation strings',
          trackingLabel: 'exportTranslationString',
        });
      });
    }
  });

  describe('translation-strings deletion events', () => {
    for (const event of ['settings.delete', 'translations.delete']) {
      it(`${event} composes the deprecation pipeline with the translation-strings projector`, async () => {
        await registrations.get(event)!({ keys: ['k1', 'k2'] }, { schema: fakeSchema });

        expect(pipelineMocks.runAutomatedDeprecationPipeline).toHaveBeenCalledExactlyOnceWith({
          itemIds: ['k1', 'k2'],
          loadContext: 'loadContextSentinel',
          fetchSourceLanguageImportContent: 'sourceLanguageFetcherSentinel',
          projectDeprecationKeys: { tag: 'translation-strings-projector' },
        });
        expect(reporterMocks.reportAutomatedDeprecationOutcome).toHaveBeenCalledExactlyOnceWith({
          outcome: { kind: 'deprecated', keysCount: 0 },
          logger: fakeLogger,
          label: 'translation strings',
          trackingLabel: 'deprecateDeletedTranslationStrings',
        });
      });
    }
  });

  describe('collection content export events', () => {
    it('items.update passes its keys array straight through to the collection-content fetcher', async () => {
      await registrations.get('items.update')!({ keys: ['a', 'b'], collection: 'articles' }, { schema: fakeSchema });

      expect(adapterMocks.collectionContentFetcherFactory).toHaveBeenCalledExactlyOnceWith({
        ItemsService: fakeItemsService,
        FieldsService: fakeFieldsService,
        schema: fakeSchema,
        keys: ['a', 'b'],
        collection: 'articles',
        logger: fakeLogger,
      });
      expect(pipelineMocks.runAutomatedExportPipeline).toHaveBeenCalledExactlyOnceWith({
        loadContext: 'loadContextSentinel',
        directusApi: { tag: 'directus-api-service-sentinel' },
        fetchContent: 'collectionContentFetcherSentinel',
        dispatchContent: 'dispatchSentinel',
      });
      expect(reporterMocks.reportAutomatedExportOutcome).toHaveBeenCalledExactlyOnceWith({
        outcome: { kind: 'exported' },
        logger: fakeLogger,
        label: 'articles content for keys a, b',
        trackingLabel: 'exportCollectionContent',
      });
    });

    it('items.create wraps its single key as a one-element array', async () => {
      await registrations.get('items.create')!({ key: 'a', collection: 'articles' }, { schema: fakeSchema });

      expect(adapterMocks.collectionContentFetcherFactory).toHaveBeenCalledWith(
        expect.objectContaining({ keys: ['a'], collection: 'articles' }),
      );
      expect(reporterMocks.reportAutomatedExportOutcome).toHaveBeenCalledWith(
        expect.objectContaining({ label: 'articles content for keys a' }),
      );
    });
  });

  it('items.delete composes the deprecation pipeline with the collection-keyed projector', async () => {
    await registrations.get('items.delete')!({ keys: ['x'], collection: 'articles' }, { schema: fakeSchema });

    expect(pipelineMocks.runAutomatedDeprecationPipeline).toHaveBeenCalledExactlyOnceWith({
      itemIds: ['x'],
      loadContext: 'loadContextSentinel',
      fetchSourceLanguageImportContent: 'sourceLanguageFetcherSentinel',
      projectDeprecationKeys: { tag: 'collection-projector', collection: 'articles' },
    });
    expect(reporterMocks.reportAutomatedDeprecationOutcome).toHaveBeenCalledExactlyOnceWith({
      outcome: { kind: 'deprecated', keysCount: 0 },
      logger: fakeLogger,
      label: 'collection articles',
      trackingLabel: 'deprecateDeletedCollectionItems',
    });
  });

  it('handlers return early without invoking the pipelines when schema is missing', async () => {
    for (const [, handler] of registrations) {
      await handler({ keys: [] }, { schema: undefined });
    }
    expect(pipelineMocks.runAutomatedExportPipeline).not.toHaveBeenCalled();
    expect(pipelineMocks.runAutomatedDeprecationPipeline).not.toHaveBeenCalled();
    expect(reporterMocks.reportAutomatedExportOutcome).not.toHaveBeenCalled();
    expect(reporterMocks.reportAutomatedDeprecationOutcome).not.toHaveBeenCalled();
  });
});
