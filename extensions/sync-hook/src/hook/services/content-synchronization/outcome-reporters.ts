import { AutomatedExportOutcome } from '../../../../../common/services/orchestrator/automated-export-pipeline';
import { AutomatedDeprecationOutcome } from '../../../../../common/services/orchestrator/automated-deprecation-pipeline';
import { trackDirectusError } from '../../functions/track-error';
import type { DirectusLogger } from '../../types/directus-services';

/**
 * Maps an Automated export pipeline outcome to Directus logger calls and
 * `trackDirectusError` invocations. The pipeline itself never logs — this reporter is
 * the single bundle-edge translator from discriminated outcome to side effects.
 *
 * `label` carries the per-event context (e.g. `"translation strings"` or
 * `"articles content for keys k1, k2"`). `trackingLabel` is the legacy
 * `trackDirectusError` tag (`"exportTranslationString"`, `"exportCollectionContent"`).
 *
 * Variants the reporter knows about — these mirror `AutomatedExportOutcome` 1:1; if a
 * new variant is added in `automated-export-pipeline.ts`, this switch must handle it or
 * TypeScript's exhaustiveness check (`assertNever`) will fail.
 */
export function reportAutomatedExportOutcome(input: {
  outcome: AutomatedExportOutcome;
  logger: DirectusLogger;
  label: string;
  trackingLabel: string;
}): void {
  const { outcome, logger, label, trackingLabel } = input;
  switch (outcome.kind) {
    case 'exported':
      logger.info(`Localazy: Exporting ${label}`);
      return;
    case 'nothing-to-export':
      logger.info(`Localazy: Nothing to export for ${label}`);
      return;
    case 'missing-context':
      // Includes "schema lacks Localazy collections" (brand-new install) and "rows
      // missing in db" (configuration incomplete). Debug-level for both: brand-new
      // installs shouldn't pollute error logs.
      logger.debug(`Localazy: not configured yet — skipping ${label}`);
      return;
    case 'export-disabled':
      logger.debug(`Localazy: automated export disabled — skipping ${label}`);
      return;
    case 'no-project':
      logger.error('Localazy: Could not load project');
      return;
    case 'payment-disabled':
      logger.error('Localazy: Sync operations disabled due to payment status');
      return;
    case 'failed':
      logger.info(`Localazy: Exporting ${label} failed`);
      logger.error(outcome.error);
      trackDirectusError(outcome.error, trackingLabel);
      return;
    default:
      assertNever(outcome);
  }
}

/**
 * Maps an Automated deprecation pipeline outcome to logger + tracking side effects.
 * Mirrors `reportAutomatedExportOutcome`.
 */
export function reportAutomatedDeprecationOutcome(input: {
  outcome: AutomatedDeprecationOutcome;
  logger: DirectusLogger;
  label: string;
  trackingLabel: string;
}): void {
  const { outcome, logger, label, trackingLabel } = input;
  switch (outcome.kind) {
    case 'deprecated':
      if (outcome.keysCount === 0) {
        logger.info(`Localazy: Nothing to deprecate for ${label}`);
      } else {
        logger.info(`Localazy: Deprecated ${outcome.keysCount} keys for ${label}`);
      }
      return;
    case 'missing-context':
      logger.debug(`Localazy: not configured yet — skipping deprecation for ${label}`);
      return;
    case 'deprecation-disabled':
      // ADR-0001: either automated_upload or automated_deprecation is off.
      return;
    case 'no-project':
      logger.error('Localazy: Could not load project');
      return;
    case 'payment-disabled':
      logger.error('Localazy: Sync operations disabled due to payment status');
      return;
    case 'could-not-fetch-import-content':
      logger.error(`Localazy: Could not deprecate deleted ${label}`);
      return;
    case 'failed':
      logger.error(`Localazy: Deprecating deleted ${label} failed`);
      logger.error(outcome.error);
      trackDirectusError(outcome.error, trackingLabel);
      return;
    default:
      assertNever(outcome);
  }
}

function assertNever(x: never): never {
  throw new Error(`Unhandled outcome variant: ${JSON.stringify(x)}`);
}
