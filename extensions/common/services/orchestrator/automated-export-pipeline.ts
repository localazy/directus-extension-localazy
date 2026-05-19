import { isEmpty, size } from 'lodash';
import { Project } from '@localazy/api-client';
import { Settings } from '../../models/collections-data/settings';
import { ContentTransferSetupDatabase } from '../../models/collections-data/content-transfer-setup';
import { LocalazyData } from '../../models/collections-data/localazy-data';
import { TranslatableContent } from '../../models/translatable-content';
import { DirectusApi } from '../../interfaces/directus-api';
import { SynchronizationLanguagesService } from '../synchronization-languages-service';
import { LocalazyPaymentStatus } from '../../utilities/localazy-payment-status';
import { loadLocalazyProject } from '../load-localazy-project';

/**
 * The three rows of Localazy configuration the Automated export pipeline reads before
 * each run. Loaded together by the `loadContext` port so the pipeline never holds a
 * half-resolved state (e.g. settings without data or transfer setup).
 */
export type AutomatedExportLocalazyContext = {
  settings: Settings;
  contentTransferSetup: ContentTransferSetupDatabase;
  localazyData: LocalazyData;
};

/**
 * Loads the Localazy context. Returns `null` when any of the three rows is missing —
 * the pipeline treats that uniformly as a `missing-context` outcome.
 */
export type AutomatedExportLocalazyContextLoader = () => Promise<AutomatedExportLocalazyContext | null>;

export type AutomatedExportContentFetcherInput = {
  context: AutomatedExportLocalazyContext;
  localazyProject: Project;
  // SynchronizationLanguagesService.resolveExportLanguages returns a `string[]` — Directus
  // language codes, not the richer DirectusLocalazyLanguage triple. Downstream services
  // (ApiTranslatableCollectionsService, TranslationStringsService) consume them as codes.
  exportLanguages: string[];
};

/**
 * Strategy plugged in by the caller: produce the translatable content to export. Two
 * production implementations on the bundle side: one for collection-item exports, one
 * for translation-string exports.
 */
export type AutomatedExportContentFetcher = (input: AutomatedExportContentFetcherInput) => Promise<TranslatableContent>;

export type AutomatedExportContentDispatcherInput = {
  content: TranslatableContent;
  context: AutomatedExportLocalazyContext;
  localazyProject: Project;
};

/**
 * Strategy plugged in by the caller: send the resolved content to Localazy. The bundle
 * adapter wraps `ExportToLocalazyService.exportContentToLocalazy`.
 */
export type AutomatedExportContentDispatcher = (input: AutomatedExportContentDispatcherInput) => Promise<void>;

/**
 * Discriminated outcome of one Automated export pipeline run. The pipeline never logs
 * or tracks errors directly — the caller (today: the Sync-hook bundle's hook/index.ts)
 * maps each variant to the appropriate logger call and `trackDirectusError` invocation.
 *
 * Variants map roughly onto the bail points the original
 * `BaseContentSynchronizationService`-derived services had:
 *   - `missing-context`   → "Missing settings or content transfer setup"
 *   - `export-disabled`   → automated_upload toggle is off (new explicit gate, see below)
 *   - `no-project`        → loadProject returned null (token missing or no projects)
 *   - `payment-disabled`  → payment-status gate blocked the run
 *   - `nothing-to-export` → source language has no content (fetcher returned empty)
 *   - `exported`          → dispatch was invoked; `itemsProcessed` is the count of
 *                            distinct source-language keys that flowed through dispatch
 *   - `failed`            → any helper threw; the original error is preserved
 *
 * Behaviour change from the legacy services: `automated_upload` is now gated at the
 * top of the pipeline. Previously the check lived deep inside
 * `ExportToLocalazyService.exportContentToLocalazy`, which meant a `loadProject` API
 * call and language resolution still ran on disabled installs.
 */
export type AutomatedExportOutcome =
  | { kind: 'exported'; itemsProcessed: number }
  | { kind: 'nothing-to-export' }
  | { kind: 'missing-context' }
  | { kind: 'export-disabled' }
  | { kind: 'no-project' }
  | { kind: 'payment-disabled' }
  | { kind: 'failed'; error: unknown };

export type AutomatedExportPipelineOptions = {
  loadContext: AutomatedExportLocalazyContextLoader;
  directusApi: DirectusApi;
  fetchContent: AutomatedExportContentFetcher;
  dispatchContent: AutomatedExportContentDispatcher;
};

/**
 * Runs one Automated export end-to-end. Pure orchestrator — all side effects flow
 * through the four injected ports plus the `loadLocalazyProject` helper. The pipeline
 * does no logging and never throws; instead it returns a discriminated outcome the
 * caller maps to logger + error-tracking calls.
 */
export async function runAutomatedExportPipeline(opts: AutomatedExportPipelineOptions): Promise<AutomatedExportOutcome> {
  try {
    const context = await opts.loadContext();
    if (!context) {
      return { kind: 'missing-context' };
    }

    if (!context.settings.automated_upload) {
      return { kind: 'export-disabled' };
    }

    const localazyProject = await loadLocalazyProject(context.localazyData.access_token);
    if (!localazyProject) {
      return { kind: 'no-project' };
    }

    if (LocalazyPaymentStatus.shouldDisableSyncOperations(localazyProject)) {
      return { kind: 'payment-disabled' };
    }

    const exportLanguages = await new SynchronizationLanguagesService(opts.directusApi).resolveExportLanguages(context.settings);

    const content = await opts.fetchContent({ context, localazyProject, exportLanguages });

    if (isEmpty(content.sourceLanguage)) {
      return { kind: 'nothing-to-export' };
    }

    await opts.dispatchContent({ content, context, localazyProject });
    // The count of distinct source-language keys is what landed in Localazy as keys;
    // surfaced so the burst coordinator can roll it into the persisted Sync-log row's
    // `items_processed` column. `isEmpty` above guarantees this is >= 1 on this branch.
    return { kind: 'exported', itemsProcessed: size(content.sourceLanguage) };
  } catch (error) {
    return { kind: 'failed', error };
  }
}
