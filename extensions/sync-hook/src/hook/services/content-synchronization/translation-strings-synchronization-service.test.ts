import { describe, it, expect, vi, beforeEach } from 'vitest';
import { translationStringsSynchronizationService } from './translation-strings-synchronization-service';
import { BaseContentSynchronizationService } from './base-content-synchronization-service';
import type { DirectusLogger } from '../../types/directus-services';

// The service is a singleton instance of TranslationStringsSynchronizationService, which
// extends BaseContentSynchronizationService. Most of the orchestration logic lives on the
// base class — these tests stub the base methods so we can exercise the flow control in
// translation-strings-synchronization-service.ts without standing up a real Localazy
// account or a Directus schema.

type AnyFn = (...args: unknown[]) => unknown;

const proto = BaseContentSynchronizationService.prototype as unknown as Record<string, AnyFn>;

// Pino's Logger has overloaded log methods that vi.fn()'s Mock<Procedure> doesn't
// structurally satisfy. The `as unknown as Logger` cast is the test-mock escape hatch
// CLAUDE.md allows when a single `as Target` doesn't compile.
function makeLogger() {
  return {
    level: 'info',
    fatal: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    silent: vi.fn(),
  } as unknown as DirectusLogger;
}

function makeSchema() {
  // The service only checks .collections for the two Localazy collection names.
  return {
    collections: {
      localazy_settings: {},
      localazy_content_transfer_setup: {},
    },
  };
}

const sampleSettings = { automated_deprecation: true };
const sampleTransferSetup = { translation_strings: true, enabled_fields: '[]' };
const sampleLocalazyData = { access_token: 'tok' };
const sampleProject = { id: 'p1' };

describe('translationStringsSynchronizationService.exportTranslationString', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('logs at debug and returns early when the Localazy collections are missing from the schema', async () => {
    const logger = makeLogger();
    const exportSpy = vi.spyOn(proto, 'exportToLocalazy').mockResolvedValue(undefined);

    await translationStringsSynchronizationService.exportTranslationString({
      schema: { collections: {} } as never,
      logger,
      ItemsService: vi.fn(),
    });

    expect(logger.debug).toHaveBeenCalledWith('Localazy: not configured yet — skipping translation strings export');
    expect(logger.error).not.toHaveBeenCalled();
    expect(exportSpy).not.toHaveBeenCalled();
  });

  it('aborts and logs when sync operations are disabled by payment status', async () => {
    const logger = makeLogger();
    vi.spyOn(proto, 'resolveLocalazySettings').mockResolvedValue({
      settings: sampleSettings,
      contentTransferSetup: sampleTransferSetup,
    });
    vi.spyOn(proto, 'resolveLocalazyData').mockResolvedValue({ localazyData: sampleLocalazyData });
    vi.spyOn(proto, 'loadProject').mockResolvedValue(sampleProject);
    vi.spyOn(proto, 'shouldDisableSyncOperations').mockReturnValue(true);
    const exportSpy = vi.spyOn(proto, 'exportToLocalazy').mockResolvedValue(undefined);

    await translationStringsSynchronizationService.exportTranslationString({
      schema: makeSchema() as never,
      logger,
      ItemsService: vi.fn(),
    });

    expect(logger.error).toHaveBeenCalledWith('Localazy: Sync operations disabled due to payment status');
    expect(exportSpy).not.toHaveBeenCalled();
  });

  it('calls exportToLocalazy when content has a non-empty source language', async () => {
    const logger = makeLogger();
    vi.spyOn(proto, 'resolveLocalazySettings').mockResolvedValue({
      settings: sampleSettings,
      contentTransferSetup: sampleTransferSetup,
    });
    vi.spyOn(proto, 'resolveLocalazyData').mockResolvedValue({ localazyData: sampleLocalazyData });
    vi.spyOn(proto, 'loadProject').mockResolvedValue(sampleProject);
    vi.spyOn(proto, 'shouldDisableSyncOperations').mockReturnValue(false);

    // fetchTranslationStrings is a private method on the subclass — cast to access it.
    const subclassProto = Object.getPrototypeOf(translationStringsSynchronizationService) as Record<string, AnyFn>;
    vi.spyOn(subclassProto, 'fetchTranslationStrings').mockResolvedValue({
      sourceLanguage: { en: { hello: 'Hello' } },
      otherLanguages: {},
    });

    const exportSpy = vi.spyOn(proto, 'exportToLocalazy').mockResolvedValue(undefined);

    await translationStringsSynchronizationService.exportTranslationString({
      schema: makeSchema() as never,
      logger,
      ItemsService: vi.fn(),
    });

    expect(logger.info).toHaveBeenCalledWith('Localazy: Exporting translation strings');
    expect(exportSpy).toHaveBeenCalledOnce();
    expect(exportSpy.mock.calls[0]![0]).toMatchObject({
      settings: sampleSettings,
      localazyData: sampleLocalazyData,
      localazyProject: sampleProject,
    });
  });

  it('skips exportToLocalazy when there is no source-language content to send', async () => {
    const logger = makeLogger();
    vi.spyOn(proto, 'resolveLocalazySettings').mockResolvedValue({
      settings: sampleSettings,
      contentTransferSetup: sampleTransferSetup,
    });
    vi.spyOn(proto, 'resolveLocalazyData').mockResolvedValue({ localazyData: sampleLocalazyData });
    vi.spyOn(proto, 'loadProject').mockResolvedValue(sampleProject);
    vi.spyOn(proto, 'shouldDisableSyncOperations').mockReturnValue(false);

    const subclassProto = Object.getPrototypeOf(translationStringsSynchronizationService) as Record<string, AnyFn>;
    vi.spyOn(subclassProto, 'fetchTranslationStrings').mockResolvedValue({
      sourceLanguage: {},
      otherLanguages: {},
    });

    const exportSpy = vi.spyOn(proto, 'exportToLocalazy').mockResolvedValue(undefined);

    await translationStringsSynchronizationService.exportTranslationString({
      schema: makeSchema() as never,
      logger,
      ItemsService: vi.fn(),
    });

    expect(logger.info).toHaveBeenCalledWith('Localazy: Nothing to export');
    expect(exportSpy).not.toHaveBeenCalled();
  });
});

describe('translationStringsSynchronizationService.deprecateDeletedTranslationStrings', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('does nothing when automated_deprecation is disabled', async () => {
    const logger = makeLogger();
    vi.spyOn(proto, 'resolveLocalazySettings').mockResolvedValue({
      settings: { automated_deprecation: false },
      contentTransferSetup: sampleTransferSetup,
    });
    vi.spyOn(proto, 'resolveLocalazyData').mockResolvedValue({ localazyData: sampleLocalazyData });
    const loadProjectSpy = vi.spyOn(proto, 'loadProject');
    const deprecateSpy = vi.spyOn(proto, 'deprecateLocalazyKeys').mockResolvedValue(undefined);

    await translationStringsSynchronizationService.deprecateDeletedTranslationStrings({
      schema: makeSchema() as never,
      itemIds: ['id1'],
      logger,
      ItemsService: vi.fn(),
    });

    // The function returns before any project load / deprecate happens.
    expect(loadProjectSpy).not.toHaveBeenCalled();
    expect(deprecateSpy).not.toHaveBeenCalled();
  });

  it('deprecates only the Localazy keys whose directusId is in the deleted set', async () => {
    const logger = makeLogger();
    vi.spyOn(proto, 'resolveLocalazySettings').mockResolvedValue({
      settings: sampleSettings,
      contentTransferSetup: sampleTransferSetup,
    });
    vi.spyOn(proto, 'resolveLocalazyData').mockResolvedValue({ localazyData: sampleLocalazyData });
    vi.spyOn(proto, 'loadProject').mockResolvedValue(sampleProject);
    vi.spyOn(proto, 'shouldDisableSyncOperations').mockReturnValue(false);
    vi.spyOn(proto, 'fetchLocalazyContentInSourceLanguage').mockResolvedValue({
      importContent: {
        success: true,
        content: {
          translationStrings: [
            // Each Directus translation string has one Localazy key per language;
            // we exercise both single-language and multi-language cases here so the
            // deprecation flow emits IDs for every language a deleted string had.
            { directusId: 'kept-id', localazyKeys: { en: { id: 'lk-kept' } } },
            { directusId: 'deleted-id-a', localazyKeys: { en: { id: 'lk-a-en' }, de: { id: 'lk-a-de' } } },
            { directusId: 'deleted-id-b', localazyKeys: { en: { id: 'lk-b' } } },
          ],
        },
      },
    });
    const deprecateSpy = vi.spyOn(proto, 'deprecateLocalazyKeys').mockResolvedValue(undefined);

    await translationStringsSynchronizationService.deprecateDeletedTranslationStrings({
      schema: makeSchema() as never,
      itemIds: ['deleted-id-a', 'deleted-id-b'],
      logger,
      ItemsService: vi.fn(),
    });

    expect(deprecateSpy).toHaveBeenCalledOnce();
    const [, projectId, keyIds] = deprecateSpy.mock.calls[0]!;
    expect(projectId).toBe('p1');
    expect(new Set(keyIds as string[])).toEqual(new Set(['lk-a-en', 'lk-a-de', 'lk-b']));
  });
});
