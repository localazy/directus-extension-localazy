import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DirectusLogger } from '../../types/directus-services';

const trackMocks = vi.hoisted(() => ({
  trackDirectusError: vi.fn(),
}));

vi.mock('../../functions/track-error', () => ({
  trackDirectusError: trackMocks.trackDirectusError,
}));

import { reportAutomatedDeprecationOutcome, reportAutomatedExportOutcome } from './outcome-reporters';

function makeLogger(): DirectusLogger {
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

describe('reportAutomatedExportOutcome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs 'Exporting <label>' at info on the exported outcome", () => {
    const logger = makeLogger();

    reportAutomatedExportOutcome({
      outcome: { kind: 'exported' },
      logger,
      label: 'translation strings',
      trackingLabel: 'exportTranslationString',
    });

    expect(logger.info).toHaveBeenCalledExactlyOnceWith('Localazy: Exporting translation strings');
    expect(trackMocks.trackDirectusError).not.toHaveBeenCalled();
  });

  it("logs 'Nothing to export for <label>' at info on the nothing-to-export outcome", () => {
    const logger = makeLogger();

    reportAutomatedExportOutcome({
      outcome: { kind: 'nothing-to-export' },
      logger,
      label: 'articles content for keys k1',
      trackingLabel: 'exportCollectionContent',
    });

    expect(logger.info).toHaveBeenCalledExactlyOnceWith('Localazy: Nothing to export for articles content for keys k1');
  });

  // Behaviour change from legacy: the "schema lacks Localazy collections" path used to
  // debug-log, while "rows missing from db" used to error-log. The new reporter collapses
  // both into debug — a fresh install shouldn't surface as an error.
  it("logs 'not configured yet' at debug on missing-context", () => {
    const logger = makeLogger();

    reportAutomatedExportOutcome({
      outcome: { kind: 'missing-context' },
      logger,
      label: 'translation strings',
      trackingLabel: 'exportTranslationString',
    });

    expect(logger.debug).toHaveBeenCalledExactlyOnceWith('Localazy: not configured yet — skipping translation strings');
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("logs 'automated export disabled' at debug on export-disabled", () => {
    const logger = makeLogger();

    reportAutomatedExportOutcome({
      outcome: { kind: 'export-disabled' },
      logger,
      label: 'translation strings',
      trackingLabel: 'exportTranslationString',
    });

    expect(logger.debug).toHaveBeenCalledExactlyOnceWith('Localazy: automated export disabled — skipping translation strings');
  });

  it("logs 'Could not load project' at error on no-project", () => {
    const logger = makeLogger();

    reportAutomatedExportOutcome({
      outcome: { kind: 'no-project' },
      logger,
      label: 'x',
      trackingLabel: 't',
    });

    expect(logger.error).toHaveBeenCalledExactlyOnceWith('Localazy: Could not load project');
  });

  it("logs 'Sync operations disabled due to payment status' at error on payment-disabled", () => {
    const logger = makeLogger();

    reportAutomatedExportOutcome({
      outcome: { kind: 'payment-disabled' },
      logger,
      label: 'x',
      trackingLabel: 't',
    });

    expect(logger.error).toHaveBeenCalledExactlyOnceWith('Localazy: Sync operations disabled due to payment status');
  });

  it('logs failure + invokes trackDirectusError with the supplied tracking label on failed', () => {
    const logger = makeLogger();
    const error = new Error('boom');

    reportAutomatedExportOutcome({
      outcome: { kind: 'failed', error },
      logger,
      label: 'translation strings',
      trackingLabel: 'exportTranslationString',
    });

    expect(logger.info).toHaveBeenCalledWith('Localazy: Exporting translation strings failed');
    expect(logger.error).toHaveBeenCalledWith(error);
    expect(trackMocks.trackDirectusError).toHaveBeenCalledExactlyOnceWith(error, 'exportTranslationString');
  });
});

describe('reportAutomatedDeprecationOutcome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs 'Deprecated N keys for <label>' at info on a non-zero deprecated outcome", () => {
    const logger = makeLogger();

    reportAutomatedDeprecationOutcome({
      outcome: { kind: 'deprecated', keysCount: 3 },
      logger,
      label: 'collection articles',
      trackingLabel: 'deprecateDeletedCollectionItems',
    });

    expect(logger.info).toHaveBeenCalledExactlyOnceWith('Localazy: Deprecated 3 keys for collection articles');
  });

  // Behaviour change: legacy code would have logged "Deprecated 0 keys" — the new
  // reporter distinguishes the no-op path explicitly so the Activity row reads better.
  it("logs 'Nothing to deprecate' when deprecated outcome has keysCount === 0", () => {
    const logger = makeLogger();

    reportAutomatedDeprecationOutcome({
      outcome: { kind: 'deprecated', keysCount: 0 },
      logger,
      label: 'collection articles',
      trackingLabel: 'deprecateDeletedCollectionItems',
    });

    expect(logger.info).toHaveBeenCalledExactlyOnceWith('Localazy: Nothing to deprecate for collection articles');
  });

  it('is silent on the deprecation-disabled outcome (gated by ADR-0001 toggles)', () => {
    const logger = makeLogger();

    reportAutomatedDeprecationOutcome({
      outcome: { kind: 'deprecation-disabled' },
      logger,
      label: 'collection articles',
      trackingLabel: 'deprecateDeletedCollectionItems',
    });

    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.debug).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("logs 'not configured yet' at debug on missing-context", () => {
    const logger = makeLogger();

    reportAutomatedDeprecationOutcome({
      outcome: { kind: 'missing-context' },
      logger,
      label: 'translation strings',
      trackingLabel: 'deprecateDeletedTranslationStrings',
    });

    expect(logger.debug).toHaveBeenCalledExactlyOnceWith('Localazy: not configured yet — skipping deprecation for translation strings');
  });

  it('logs at error on no-project, payment-disabled, and could-not-fetch-import-content', () => {
    const logger = makeLogger();

    reportAutomatedDeprecationOutcome({ outcome: { kind: 'no-project' }, logger, label: 'x', trackingLabel: 't' });
    reportAutomatedDeprecationOutcome({ outcome: { kind: 'payment-disabled' }, logger, label: 'x', trackingLabel: 't' });
    reportAutomatedDeprecationOutcome({
      outcome: { kind: 'could-not-fetch-import-content' },
      logger,
      label: 'translation strings',
      trackingLabel: 't',
    });

    expect(logger.error).toHaveBeenNthCalledWith(1, 'Localazy: Could not load project');
    expect(logger.error).toHaveBeenNthCalledWith(2, 'Localazy: Sync operations disabled due to payment status');
    expect(logger.error).toHaveBeenNthCalledWith(3, 'Localazy: Could not deprecate deleted translation strings');
  });

  it('logs failure + invokes trackDirectusError on failed', () => {
    const logger = makeLogger();
    const error = new Error('boom');

    reportAutomatedDeprecationOutcome({
      outcome: { kind: 'failed', error },
      logger,
      label: 'collection articles',
      trackingLabel: 'deprecateDeletedCollectionItems',
    });

    expect(logger.error).toHaveBeenCalledWith('Localazy: Deprecating deleted collection articles failed');
    expect(logger.error).toHaveBeenCalledWith(error);
    expect(trackMocks.trackDirectusError).toHaveBeenCalledExactlyOnceWith(error, 'deprecateDeletedCollectionItems');
  });
});
