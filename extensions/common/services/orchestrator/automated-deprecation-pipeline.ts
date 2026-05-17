import { Project } from '@localazy/api-client';
import { LocalazyContent } from '../../models/localazy-content';
import { LocalazyPaymentStatus } from '../../utilities/localazy-payment-status';
import { loadLocalazyProject } from '../load-localazy-project';
import { deprecateLocalazyKeys } from '../deprecate-localazy-keys';
import { AutomatedExportLocalazyContext, AutomatedExportLocalazyContextLoader } from './automated-export-pipeline';

/**
 * Result returned by the `fetchSourceLanguageImportContent` port. Mirrors the shape of
 * `importFromLocalazyService.importContentFromLocalazy` — the bundle adapter passes the
 * call through verbatim.
 */
export type SourceLanguageImportContentResult = { success: true; content: LocalazyContent } | { success: false };

export type SourceLanguageImportContentFetcherInput = {
  context: AutomatedExportLocalazyContext;
  localazyProject: Project;
};

/**
 * Strategy: fetch source-language content from Localazy so the projector can locate the
 * Localazy keys that correspond to the deleted Directus item ids. The bundle adapter
 * wraps `importFromLocalazyService.importContentFromLocalazy` with a single-language
 * (source-language only) request.
 */
export type SourceLanguageImportContentFetcher = (
  input: SourceLanguageImportContentFetcherInput,
) => Promise<SourceLanguageImportContentResult>;

export type DeprecationKeyProjectorInput = {
  importContent: LocalazyContent;
  itemIds: string[];
};

/**
 * Strategy: produce the Localazy key ids to deprecate from the fetched source-language
 * import content and the deleted Directus item ids. Two production implementations:
 * one walks `content.collections.get(collection)`; the other walks
 * `content.translationStrings`.
 */
export type DeprecationKeyProjector = (input: DeprecationKeyProjectorInput) => string[];

/**
 * Discriminated outcome of one Automated deprecation pipeline run. The pipeline never
 * logs or tracks errors directly — the caller maps each variant to the appropriate
 * logger call and error-tracking invocation.
 *
 *   - `missing-context`             → settings / transfer setup / data row missing
 *   - `deprecation-disabled`        → automated_upload OR automated_deprecation off
 *                                      (ADR-0001: both must be on)
 *   - `no-project`                  → loadProject returned null
 *   - `payment-disabled`            → payment-status gate blocked the run
 *   - `could-not-fetch-import-content` → the import fetch returned `{ success: false }`
 *   - `deprecated`                  → deprecate-keys was invoked; `keysCount` carries
 *                                      the number of Localazy keys that were marked
 *                                      deprecated (may be 0 when nothing matched)
 *   - `failed`                      → any helper threw; original error preserved
 */
export type AutomatedDeprecationOutcome =
  | { kind: 'deprecated'; keysCount: number }
  | { kind: 'missing-context' }
  | { kind: 'deprecation-disabled' }
  | { kind: 'no-project' }
  | { kind: 'payment-disabled' }
  | { kind: 'could-not-fetch-import-content' }
  | { kind: 'failed'; error: unknown };

export type AutomatedDeprecationPipelineOptions = {
  itemIds: string[];
  loadContext: AutomatedExportLocalazyContextLoader;
  fetchSourceLanguageImportContent: SourceLanguageImportContentFetcher;
  projectDeprecationKeys: DeprecationKeyProjector;
};

/**
 * Runs one Automated deprecation end-to-end. Mirrors `runAutomatedExportPipeline` —
 * pure orchestrator, returns a discriminated outcome, never logs.
 */
export async function runAutomatedDeprecationPipeline(opts: AutomatedDeprecationPipelineOptions): Promise<AutomatedDeprecationOutcome> {
  try {
    const context = await opts.loadContext();
    if (!context) {
      return { kind: 'missing-context' };
    }

    // ADR-0001: deprecation is a sub-behavior of the "automated export" master toggle.
    // Both flags must be on; either off and no outbound activity happens.
    if (!context.settings.automated_upload || !context.settings.automated_deprecation) {
      return { kind: 'deprecation-disabled' };
    }

    const localazyProject = await loadLocalazyProject(context.localazyData.access_token);
    if (!localazyProject) {
      return { kind: 'no-project' };
    }

    if (LocalazyPaymentStatus.shouldDisableSyncOperations(localazyProject)) {
      return { kind: 'payment-disabled' };
    }

    const result = await opts.fetchSourceLanguageImportContent({ context, localazyProject });
    if (!result.success) {
      return { kind: 'could-not-fetch-import-content' };
    }

    const keyIds = opts.projectDeprecationKeys({ importContent: result.content, itemIds: opts.itemIds });

    await deprecateLocalazyKeys(context.localazyData.access_token, localazyProject.id, keyIds);
    return { kind: 'deprecated', keysCount: keyIds.length };
  } catch (error) {
    return { kind: 'failed', error };
  }
}
