import { describe, it, expect, vi, beforeEach } from 'vitest';
import { collectionContentSynchronizationService } from './collection-content-synchronization-service';
import { BaseContentSynchronizationService } from './base-content-synchronization-service';
import type { DirectusLogger } from '../../types/directus-services';

// Sibling of translation-strings-synchronization-service.test.ts. Covers only the
// gating behaviour of `deprecateDeletedCollectionItems` — the broader orchestration
// is shared with the translation-strings service and is exercised over there.

type AnyFn = (...args: unknown[]) => unknown;

const proto = BaseContentSynchronizationService.prototype as unknown as Record<string, AnyFn>;

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
  return {
    collections: {
      localazy_settings: {},
      localazy_content_transfer_setup: {},
    },
  };
}

const sampleTransferSetup = { translation_strings: false, enabled_fields: '[]' };
const sampleLocalazyData = { access_token: 'tok' };

describe('collectionContentSynchronizationService.deprecateDeletedCollectionItems', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('does nothing when automated_deprecation is disabled', async () => {
    const logger = makeLogger();
    vi.spyOn(proto, 'resolveLocalazySettings').mockResolvedValue({
      settings: { automated_upload: true, automated_deprecation: false },
      contentTransferSetup: sampleTransferSetup,
    });
    vi.spyOn(proto, 'resolveLocalazyData').mockResolvedValue({ localazyData: sampleLocalazyData });
    const loadProjectSpy = vi.spyOn(proto, 'loadProject');
    const deprecateSpy = vi.spyOn(proto, 'deprecateLocalazyKeys').mockResolvedValue(undefined);

    await collectionContentSynchronizationService.deprecateDeletedCollectionItems({
      schema: makeSchema() as never,
      collection: 'articles',
      itemIds: ['id1'],
      logger,
      ItemsService: vi.fn(),
    });

    expect(loadProjectSpy).not.toHaveBeenCalled();
    expect(deprecateSpy).not.toHaveBeenCalled();
  });

  // ADR-0001: deprecation is a sub-behavior of the "automated export" master toggle;
  // a `automated_upload: false` setting guarantees no outbound activity, even if
  // `automated_deprecation` remained `true` from a legacy install.
  it('does nothing when automated_upload (the master export gate) is disabled', async () => {
    const logger = makeLogger();
    vi.spyOn(proto, 'resolveLocalazySettings').mockResolvedValue({
      settings: { automated_upload: false, automated_deprecation: true },
      contentTransferSetup: sampleTransferSetup,
    });
    vi.spyOn(proto, 'resolveLocalazyData').mockResolvedValue({ localazyData: sampleLocalazyData });
    const loadProjectSpy = vi.spyOn(proto, 'loadProject');
    const deprecateSpy = vi.spyOn(proto, 'deprecateLocalazyKeys').mockResolvedValue(undefined);

    await collectionContentSynchronizationService.deprecateDeletedCollectionItems({
      schema: makeSchema() as never,
      collection: 'articles',
      itemIds: ['id1'],
      logger,
      ItemsService: vi.fn(),
    });

    expect(loadProjectSpy).not.toHaveBeenCalled();
    expect(deprecateSpy).not.toHaveBeenCalled();
  });
});
