import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Project } from '@localazy/api-client';
import { Settings } from '../../models/collections-data/settings';
import { ContentTransferSetupDatabase } from '../../models/collections-data/content-transfer-setup';
import { LocalazyData } from '../../models/collections-data/localazy-data';
import { TranslatableContent } from '../../models/translatable-content';
import { DirectusApi } from '../../interfaces/directus-api';

// Hoisted so the vi.mock factories below can reference them.
const helperMocks = vi.hoisted(() => ({
  loadLocalazyProject: vi.fn(),
  resolveExportLanguages: vi.fn(),
}));

vi.mock('../load-localazy-project', () => ({
  loadLocalazyProject: helperMocks.loadLocalazyProject,
}));

vi.mock('../synchronization-languages-service', () => ({
  SynchronizationLanguagesService: class {
    resolveExportLanguages = helperMocks.resolveExportLanguages;
  },
}));

import {
  runAutomatedExportPipeline,
  AutomatedExportLocalazyContext,
  AutomatedExportContentFetcher,
  AutomatedExportContentDispatcher,
} from './automated-export-pipeline';

const baseSettings = { automated_upload: true } as Settings;
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
const emptyContent: TranslatableContent = { sourceLanguage: {}, otherLanguages: {} };
const nonEmptyContent: TranslatableContent = {
  sourceLanguage: { en: { hello: 'Hello' } },
  otherLanguages: {},
};

// The DirectusApi instance only matters as far as SynchronizationLanguagesService is
// constructed with it — the constructor is mocked above, so any object works.
const fakeDirectusApi = {} as DirectusApi;

function makeFetcher(content: TranslatableContent): AutomatedExportContentFetcher {
  return vi.fn().mockResolvedValue(content);
}

function makeDispatcher(): AutomatedExportContentDispatcher {
  return vi.fn().mockResolvedValue(undefined);
}

describe('runAutomatedExportPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    helperMocks.resolveExportLanguages.mockResolvedValue([]);
  });

  it("returns 'missing-context' when loadContext yields null", async () => {
    const fetchContent = makeFetcher(nonEmptyContent);
    const dispatchContent = makeDispatcher();

    const outcome = await runAutomatedExportPipeline({
      loadContext: async () => null,
      directusApi: fakeDirectusApi,
      fetchContent,
      dispatchContent,
    });

    expect(outcome).toEqual({ kind: 'missing-context' });
    expect(helperMocks.loadLocalazyProject).not.toHaveBeenCalled();
    expect(fetchContent).not.toHaveBeenCalled();
    expect(dispatchContent).not.toHaveBeenCalled();
  });

  // Behaviour change vs. legacy services: the toggle gate was buried inside
  // `ExportToLocalazyService.exportContentToLocalazy`; lifting it here means no Localazy
  // API call fires when the master export toggle is off.
  it("returns 'export-disabled' before any Localazy API call when settings.automated_upload is off", async () => {
    const fetchContent = makeFetcher(nonEmptyContent);
    const dispatchContent = makeDispatcher();

    const outcome = await runAutomatedExportPipeline({
      loadContext: async () => makeContext({ settings: { automated_upload: false } as Settings }),
      directusApi: fakeDirectusApi,
      fetchContent,
      dispatchContent,
    });

    expect(outcome).toEqual({ kind: 'export-disabled' });
    expect(helperMocks.loadLocalazyProject).not.toHaveBeenCalled();
    expect(fetchContent).not.toHaveBeenCalled();
    expect(dispatchContent).not.toHaveBeenCalled();
  });

  it("returns 'no-project' when loadLocalazyProject resolves to null", async () => {
    helperMocks.loadLocalazyProject.mockResolvedValue(null);
    const dispatchContent = makeDispatcher();

    const outcome = await runAutomatedExportPipeline({
      loadContext: async () => makeContext(),
      directusApi: fakeDirectusApi,
      fetchContent: makeFetcher(nonEmptyContent),
      dispatchContent,
    });

    expect(outcome).toEqual({ kind: 'no-project' });
    expect(helperMocks.loadLocalazyProject).toHaveBeenCalledWith('tok');
    expect(dispatchContent).not.toHaveBeenCalled();
  });

  it("returns 'payment-disabled' when the project's organisation is over its keys limit", async () => {
    helperMocks.loadLocalazyProject.mockResolvedValue({
      id: 'p1',
      organization: { usedKeys: 1000, availableKeys: 100, figma: true },
    } as unknown as Project);
    const dispatchContent = makeDispatcher();

    const outcome = await runAutomatedExportPipeline({
      loadContext: async () => makeContext(),
      directusApi: fakeDirectusApi,
      fetchContent: makeFetcher(nonEmptyContent),
      dispatchContent,
    });

    expect(outcome).toEqual({ kind: 'payment-disabled' });
    expect(dispatchContent).not.toHaveBeenCalled();
  });

  it("returns 'nothing-to-export' and skips dispatch when the fetcher yields an empty source language", async () => {
    helperMocks.loadLocalazyProject.mockResolvedValue(okProject);
    const dispatchContent = makeDispatcher();

    const outcome = await runAutomatedExportPipeline({
      loadContext: async () => makeContext(),
      directusApi: fakeDirectusApi,
      fetchContent: makeFetcher(emptyContent),
      dispatchContent,
    });

    expect(outcome).toEqual({ kind: 'nothing-to-export' });
    expect(dispatchContent).not.toHaveBeenCalled();
  });

  it("returns 'exported' and dispatches content + context + project on the happy path", async () => {
    helperMocks.loadLocalazyProject.mockResolvedValue(okProject);
    helperMocks.resolveExportLanguages.mockResolvedValue(['en']);
    const dispatchContent = makeDispatcher();
    const fetchContent = makeFetcher(nonEmptyContent);

    const outcome = await runAutomatedExportPipeline({
      loadContext: async () => makeContext(),
      directusApi: fakeDirectusApi,
      fetchContent,
      dispatchContent,
    });

    expect(outcome).toEqual({ kind: 'exported' });
    expect(fetchContent).toHaveBeenCalledOnce();
    expect(fetchContent).toHaveBeenCalledWith({
      context: makeContext(),
      localazyProject: okProject,
      exportLanguages: ['en'],
    });
    expect(dispatchContent).toHaveBeenCalledWith({
      content: nonEmptyContent,
      context: makeContext(),
      localazyProject: okProject,
    });
  });

  it("returns 'failed' with the original error when loadLocalazyProject throws", async () => {
    const apiError = new Error('localazy down');
    helperMocks.loadLocalazyProject.mockRejectedValue(apiError);
    const dispatchContent = makeDispatcher();

    const outcome = await runAutomatedExportPipeline({
      loadContext: async () => makeContext(),
      directusApi: fakeDirectusApi,
      fetchContent: makeFetcher(nonEmptyContent),
      dispatchContent,
    });

    expect(outcome).toEqual({ kind: 'failed', error: apiError });
    expect(dispatchContent).not.toHaveBeenCalled();
  });

  it("returns 'failed' when the fetcher throws", async () => {
    helperMocks.loadLocalazyProject.mockResolvedValue(okProject);
    const fetcherError = new Error('fetcher boom');
    const fetchContent: AutomatedExportContentFetcher = vi.fn().mockRejectedValue(fetcherError);
    const dispatchContent = makeDispatcher();

    const outcome = await runAutomatedExportPipeline({
      loadContext: async () => makeContext(),
      directusApi: fakeDirectusApi,
      fetchContent,
      dispatchContent,
    });

    expect(outcome).toEqual({ kind: 'failed', error: fetcherError });
    expect(dispatchContent).not.toHaveBeenCalled();
  });

  it("returns 'failed' when the dispatcher throws (content was already produced)", async () => {
    helperMocks.loadLocalazyProject.mockResolvedValue(okProject);
    const dispatchError = new Error('dispatch boom');
    const dispatchContent: AutomatedExportContentDispatcher = vi.fn().mockRejectedValue(dispatchError);

    const outcome = await runAutomatedExportPipeline({
      loadContext: async () => makeContext(),
      directusApi: fakeDirectusApi,
      fetchContent: makeFetcher(nonEmptyContent),
      dispatchContent,
    });

    expect(outcome).toEqual({ kind: 'failed', error: dispatchError });
  });
});
