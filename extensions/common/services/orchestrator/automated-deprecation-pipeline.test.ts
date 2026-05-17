import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Project } from '@localazy/api-client';
import { Settings } from '../../models/collections-data/settings';
import { ContentTransferSetupDatabase } from '../../models/collections-data/content-transfer-setup';
import { LocalazyData } from '../../models/collections-data/localazy-data';
import { LocalazyContent } from '../../models/localazy-content';

const helperMocks = vi.hoisted(() => ({
  loadLocalazyProject: vi.fn(),
  deprecateLocalazyKeys: vi.fn(),
}));

vi.mock('../load-localazy-project', () => ({
  loadLocalazyProject: helperMocks.loadLocalazyProject,
}));

vi.mock('../deprecate-localazy-keys', () => ({
  deprecateLocalazyKeys: helperMocks.deprecateLocalazyKeys,
}));

import {
  runAutomatedDeprecationPipeline,
  DeprecationKeyProjector,
  SourceLanguageImportContentFetcher,
} from './automated-deprecation-pipeline';
import { AutomatedExportLocalazyContext } from './automated-export-pipeline';

const baseSettings = { automated_upload: true, automated_deprecation: true } as Settings;
const baseTransferSetup = {} as ContentTransferSetupDatabase;
const baseLocalazyData = { access_token: 'tok' } as LocalazyData;

function makeContext(overrides: Partial<AutomatedExportLocalazyContext> = {}): AutomatedExportLocalazyContext {
  return {
    settings: baseSettings,
    contentTransferSetup: baseTransferSetup,
    localazyData: baseLocalazyData,
    ...overrides,
  };
}

const okProject = { id: 'p1' } as Project;
const okImportContent: LocalazyContent = {
  translationStrings: new Map(),
  collections: new Map(),
};

function makeFetcher(result: Awaited<ReturnType<SourceLanguageImportContentFetcher>>): SourceLanguageImportContentFetcher {
  return vi.fn().mockResolvedValue(result);
}

const noopProjector: DeprecationKeyProjector = () => [];

describe('runAutomatedDeprecationPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    helperMocks.deprecateLocalazyKeys.mockResolvedValue(undefined);
  });

  it("returns 'missing-context' when loadContext yields null", async () => {
    const fetcher = makeFetcher({ success: true, content: okImportContent });
    const projector = vi.fn();

    const outcome = await runAutomatedDeprecationPipeline({
      itemIds: ['a'],
      loadContext: async () => null,
      fetchSourceLanguageImportContent: fetcher,
      projectDeprecationKeys: projector,
    });

    expect(outcome).toEqual({ kind: 'missing-context' });
    expect(helperMocks.loadLocalazyProject).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    expect(helperMocks.deprecateLocalazyKeys).not.toHaveBeenCalled();
  });

  // ADR-0001: deprecation is gated by BOTH master toggle and the deprecation toggle.
  it("returns 'deprecation-disabled' when automated_upload is off", async () => {
    const outcome = await runAutomatedDeprecationPipeline({
      itemIds: ['a'],
      loadContext: async () => makeContext({ settings: { automated_upload: false, automated_deprecation: true } as Settings }),
      fetchSourceLanguageImportContent: makeFetcher({ success: false }),
      projectDeprecationKeys: noopProjector,
    });

    expect(outcome).toEqual({ kind: 'deprecation-disabled' });
    expect(helperMocks.loadLocalazyProject).not.toHaveBeenCalled();
    expect(helperMocks.deprecateLocalazyKeys).not.toHaveBeenCalled();
  });

  it("returns 'deprecation-disabled' when automated_deprecation is off", async () => {
    const outcome = await runAutomatedDeprecationPipeline({
      itemIds: ['a'],
      loadContext: async () => makeContext({ settings: { automated_upload: true, automated_deprecation: false } as Settings }),
      fetchSourceLanguageImportContent: makeFetcher({ success: false }),
      projectDeprecationKeys: noopProjector,
    });

    expect(outcome).toEqual({ kind: 'deprecation-disabled' });
    expect(helperMocks.loadLocalazyProject).not.toHaveBeenCalled();
  });

  it("returns 'no-project' when loadLocalazyProject resolves to null", async () => {
    helperMocks.loadLocalazyProject.mockResolvedValue(null);

    const outcome = await runAutomatedDeprecationPipeline({
      itemIds: ['a'],
      loadContext: async () => makeContext(),
      fetchSourceLanguageImportContent: makeFetcher({ success: true, content: okImportContent }),
      projectDeprecationKeys: noopProjector,
    });

    expect(outcome).toEqual({ kind: 'no-project' });
    expect(helperMocks.deprecateLocalazyKeys).not.toHaveBeenCalled();
  });

  it("returns 'payment-disabled' when the project lacks access to the plugin", async () => {
    helperMocks.loadLocalazyProject.mockResolvedValue({
      id: 'p1',
      organization: { usedKeys: 1, availableKeys: 1000, figma: false },
    } as unknown as Project);

    const outcome = await runAutomatedDeprecationPipeline({
      itemIds: ['a'],
      loadContext: async () => makeContext(),
      fetchSourceLanguageImportContent: makeFetcher({ success: true, content: okImportContent }),
      projectDeprecationKeys: noopProjector,
    });

    expect(outcome).toEqual({ kind: 'payment-disabled' });
    expect(helperMocks.deprecateLocalazyKeys).not.toHaveBeenCalled();
  });

  it("returns 'could-not-fetch-import-content' when the fetcher reports success: false", async () => {
    helperMocks.loadLocalazyProject.mockResolvedValue(okProject);

    const outcome = await runAutomatedDeprecationPipeline({
      itemIds: ['a'],
      loadContext: async () => makeContext(),
      fetchSourceLanguageImportContent: makeFetcher({ success: false }),
      projectDeprecationKeys: noopProjector,
    });

    expect(outcome).toEqual({ kind: 'could-not-fetch-import-content' });
    expect(helperMocks.deprecateLocalazyKeys).not.toHaveBeenCalled();
  });

  it('invokes the projector with importContent + itemIds and forwards key ids to deprecateLocalazyKeys', async () => {
    helperMocks.loadLocalazyProject.mockResolvedValue(okProject);
    const projector: DeprecationKeyProjector = vi.fn().mockReturnValue(['lk-a', 'lk-b', 'lk-c']);

    const outcome = await runAutomatedDeprecationPipeline({
      itemIds: ['d1', 'd2'],
      loadContext: async () => makeContext(),
      fetchSourceLanguageImportContent: makeFetcher({ success: true, content: okImportContent }),
      projectDeprecationKeys: projector,
    });

    expect(outcome).toEqual({ kind: 'deprecated', keysCount: 3 });
    expect(projector).toHaveBeenCalledWith({ importContent: okImportContent, itemIds: ['d1', 'd2'] });
    expect(helperMocks.deprecateLocalazyKeys).toHaveBeenCalledWith('tok', 'p1', ['lk-a', 'lk-b', 'lk-c']);
  });

  it("still reaches 'deprecated' (with keysCount 0) when the projector produces nothing", async () => {
    helperMocks.loadLocalazyProject.mockResolvedValue(okProject);

    const outcome = await runAutomatedDeprecationPipeline({
      itemIds: ['d1'],
      loadContext: async () => makeContext(),
      fetchSourceLanguageImportContent: makeFetcher({ success: true, content: okImportContent }),
      projectDeprecationKeys: () => [],
    });

    expect(outcome).toEqual({ kind: 'deprecated', keysCount: 0 });
    // deprecateLocalazyKeys is called even with empty array; the helper itself short-circuits.
    expect(helperMocks.deprecateLocalazyKeys).toHaveBeenCalledWith('tok', 'p1', []);
  });

  it("returns 'failed' with the original error when the fetcher throws", async () => {
    helperMocks.loadLocalazyProject.mockResolvedValue(okProject);
    const fetcherError = new Error('fetch boom');
    const fetcher: SourceLanguageImportContentFetcher = vi.fn().mockRejectedValue(fetcherError);

    const outcome = await runAutomatedDeprecationPipeline({
      itemIds: ['a'],
      loadContext: async () => makeContext(),
      fetchSourceLanguageImportContent: fetcher,
      projectDeprecationKeys: noopProjector,
    });

    expect(outcome).toEqual({ kind: 'failed', error: fetcherError });
    expect(helperMocks.deprecateLocalazyKeys).not.toHaveBeenCalled();
  });

  it("returns 'failed' when deprecateLocalazyKeys throws", async () => {
    helperMocks.loadLocalazyProject.mockResolvedValue(okProject);
    const apiError = new Error('localazy down');
    helperMocks.deprecateLocalazyKeys.mockRejectedValue(apiError);

    const outcome = await runAutomatedDeprecationPipeline({
      itemIds: ['a'],
      loadContext: async () => makeContext(),
      fetchSourceLanguageImportContent: makeFetcher({ success: true, content: okImportContent }),
      projectDeprecationKeys: () => ['lk-1'],
    });

    expect(outcome).toEqual({ kind: 'failed', error: apiError });
  });
});
