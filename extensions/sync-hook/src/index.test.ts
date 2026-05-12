import { describe, it, expect, vi, beforeEach } from 'vitest';

const serviceMocks = vi.hoisted(() => ({
  exportTranslationString: vi.fn().mockResolvedValue(undefined),
  deprecateDeletedTranslationStrings: vi.fn().mockResolvedValue(undefined),
  exportCollectionContent: vi.fn().mockResolvedValue(undefined),
  deprecateDeletedCollectionItems: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@directus/extensions-sdk', () => ({
  // defineHook is a passthrough at runtime; we capture the registration callback
  // and invoke it with a mocked SDK context in beforeEach below.
  defineHook: (callback: unknown) => callback,
}));

vi.mock('./services/content-synchronization/translation-strings-synchronization-service', () => ({
  translationStringsSynchronizationService: {
    exportTranslationString: serviceMocks.exportTranslationString,
    deprecateDeletedTranslationStrings: serviceMocks.deprecateDeletedTranslationStrings,
  },
}));

vi.mock('./services/content-synchronization/collection-content-synchronization-service', () => ({
  collectionContentSynchronizationService: {
    exportCollectionContent: serviceMocks.exportCollectionContent,
    deprecateDeletedCollectionItems: serviceMocks.deprecateDeletedCollectionItems,
  },
}));

// Import after vi.mock declarations (vi.mock is hoisted; the order in source doesn't matter
// but keeping the dynamic import after the mocks for readability).
import hookCallback from './index';

type HandlerMeta = Record<string, unknown>;
type Handler = (meta: HandlerMeta, ctx: { schema: unknown }) => Promise<void> | void;

describe('sync-hook entry point', () => {
  let registrations: Map<string, Handler>;
  const fakeSchema = { collections: {} };
  const fakeItemsService = vi.fn();
  const fakeFieldsService = vi.fn();
  const fakeLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    registrations = new Map();

    const action = (event: string, handler: Handler) => {
      registrations.set(event, handler);
    };
    const registerContext = { action, filter: vi.fn(), init: vi.fn(), schedule: vi.fn(), embed: vi.fn() };
    const apiContext = {
      services: { ItemsService: fakeItemsService, FieldsService: fakeFieldsService },
      logger: fakeLogger,
    };

    // Run the hook's registration callback. Cast to a callable shape since defineHook
    // is typed as returning a complex SDK type but our mock makes it a passthrough.
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

  describe('settings + translation create/update events call exportTranslationString', () => {
    for (const event of ['settings.create', 'settings.update', 'translations.create', 'translations.update']) {
      it(`${event} awaits the export call`, async () => {
        const handler = registrations.get(event);
        expect(handler).toBeDefined();
        await handler!({ keys: ['k1'] }, { schema: fakeSchema });
        expect(serviceMocks.exportTranslationString).toHaveBeenCalledExactlyOnceWith({
          schema: fakeSchema,
          logger: fakeLogger,
          ItemsService: fakeItemsService,
        });
      });
    }
  });

  describe('settings.delete + translations.delete call deprecateDeletedTranslationStrings', () => {
    for (const event of ['settings.delete', 'translations.delete']) {
      it(`${event} awaits the deprecate call`, async () => {
        const handler = registrations.get(event);
        expect(handler).toBeDefined();
        await handler!({ keys: ['k1', 'k2'] }, { schema: fakeSchema });
        expect(serviceMocks.deprecateDeletedTranslationStrings).toHaveBeenCalledExactlyOnceWith({
          schema: fakeSchema,
          logger: fakeLogger,
          itemIds: ['k1', 'k2'],
          ItemsService: fakeItemsService,
        });
      });
    }
  });

  describe('items.create + items.update normalise key payload and call exportCollectionContent', () => {
    it('items.update passes its keys array straight through', async () => {
      const handler = registrations.get('items.update');
      await handler!({ keys: ['a', 'b'], collection: 'articles' }, { schema: fakeSchema });
      expect(serviceMocks.exportCollectionContent).toHaveBeenCalledExactlyOnceWith({
        schema: fakeSchema,
        ItemsService: fakeItemsService,
        FieldsService: fakeFieldsService,
        logger: fakeLogger,
        keys: ['a', 'b'],
        collection: 'articles',
      });
    });

    it('items.create wraps its single key as a one-element array', async () => {
      const handler = registrations.get('items.create');
      await handler!({ key: 'a', collection: 'articles' }, { schema: fakeSchema });
      expect(serviceMocks.exportCollectionContent).toHaveBeenCalledExactlyOnceWith({
        schema: fakeSchema,
        ItemsService: fakeItemsService,
        FieldsService: fakeFieldsService,
        logger: fakeLogger,
        keys: ['a'],
        collection: 'articles',
      });
    });
  });

  it('items.delete calls deprecateDeletedCollectionItems', async () => {
    const handler = registrations.get('items.delete');
    await handler!({ keys: ['x'], collection: 'articles' }, { schema: fakeSchema });
    expect(serviceMocks.deprecateDeletedCollectionItems).toHaveBeenCalledExactlyOnceWith({
      schema: fakeSchema,
      collection: 'articles',
      logger: fakeLogger,
      itemIds: ['x'],
      ItemsService: fakeItemsService,
    });
  });

  it('handlers return early without invoking the service when schema is missing', async () => {
    for (const [, handler] of registrations) {
      await handler({ keys: [] }, { schema: undefined });
    }
    expect(serviceMocks.exportTranslationString).not.toHaveBeenCalled();
    expect(serviceMocks.deprecateDeletedTranslationStrings).not.toHaveBeenCalled();
    expect(serviceMocks.exportCollectionContent).not.toHaveBeenCalled();
    expect(serviceMocks.deprecateDeletedCollectionItems).not.toHaveBeenCalled();
  });
});
