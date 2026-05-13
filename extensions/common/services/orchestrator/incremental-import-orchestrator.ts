import { Project } from '@localazy/api-client';
import { createEmptyCursor, cursorMatchesProject, filterKeysByEventCursor, recordCursorEntry } from '../../utilities/sync-cursor';
import { SyncCursor } from '../../models/collections-data/sync-state';
import { DirectusLocalazyLanguage } from '../../models/directus-localazy-language';
import { EnabledField } from '../../models/collections-data/content-transfer-setup';
import { LocalazyData } from '../../models/collections-data/localazy-data';
import { Settings } from '../../models/collections-data/settings';
import { OrchestratorAdapters } from './ports';
import { LocalazyContentSummary, summarizeLocalazyContent } from './summarize-localazy-content';
import { upsertFromLocalazyContent } from './upsert-localazy-content';
import { WrittenTriple } from './written-triple';

export type SyncMode = 'incremental' | 'full';

/**
 * Stable progress-message ids the orchestrator itself emits (not the upsert step). The
 * module adapter maps these to `ProgressTrackerId` enum values so the progress modal's
 * de-dupe-by-id semantics carry over. Future server adapters route the same ids
 * elsewhere.
 *
 * The sync-mode header ("Full sync —" / "Incremental sync") and the
 * "Retrieving target languages" line are intentionally _not_ emitted by the orchestrator:
 * they happen before languages are resolved, which the orchestrator receives as a param.
 * The caller (composable / future webhook handler) is responsible for those lines.
 */
export const ImportProgressIds = {
  FETCHING_TRANSLATIONS: 'fetching-translations' as const,
  CHANGES_SUMMARY: 'changes-summary' as const,
  UP_TO_DATE: 'up-to-date' as const,
  IMPORT_FINISHED: 'import-finished' as const,
};

export type IncrementalImportParams = {
  mode: SyncMode;
  languages: DirectusLocalazyLanguage[];
  enabledFields: EnabledField[];
  localazyData: LocalazyData;
  localazyProject: Project;
  settings: Settings;
};

export type IncrementalImportResult = {
  /**
   * `completed` — at least one change applied (or attempted) this run.
   * `up-to-date` — short-circuit: nothing new since the last sync.
   * `aborted` — the Localazy fetch failed (`success: false`). The orchestrator returns
   * early without persisting the cursor — there's nothing to advance.
   */
  status: 'completed' | 'up-to-date' | 'aborted';
  /** Total `(lang, keyId, event)` writes the orchestrator recorded via `onWritten`. */
  itemsProcessed: number;
  /** Wall-clock duration of the run in milliseconds. */
  durationMs: number;
  /** Headline summary of the fetched content. `undefined` when status is `aborted`. */
  summary?: LocalazyContentSummary;
};

/**
 * Drives the incremental-download sync end-to-end:
 *   1. Loads the on-disk cursor (auto-invalidating against the current project).
 *   2. Fetches changed Localazy content through the cursor filter (or everything in
 *      full-sync mode).
 *   3. Short-circuits if there are no changes (still touches `last_sync_at` via
 *      `cursorStore.persist`).
 *   4. Upserts into Directus, recording per-item triples through a throttled flush so
 *      a long sync can checkpoint progress to disk.
 *   5. Persists the in-memory cursor unconditionally at the end (and on error — the
 *      `finally` makes the contract literal).
 *
 * Behavioural identity with the prior module-only implementation is preserved — the only
 * difference is _where_ the side effects land, not when or in what order.
 */
export async function runIncrementalImport(
  adapters: OrchestratorAdapters,
  params: IncrementalImportParams,
): Promise<IncrementalImportResult> {
  const { mode, languages, enabledFields, localazyData, localazyProject, settings } = params;
  const { cursorStore, localazyContentFetcher, progress, directusApi, resolveLanguageFkField, onDirectusError, reportDownloadAnalytics } =
    adapters;

  const startedAt = Date.now();

  // Load + auto-invalidate the on-disk cursor against the current project.
  //   - Incremental mode: use the on-disk cursor as the filter base, unless the
  //     project id has changed (the user reconnected), in which case we treat it as
  //     empty.
  //   - Full Sync mode: start from an empty filter base. We do NOT wipe the
  //     persisted cursor here — merge-on-persist takes `max(event)` per cell, so
  //     prior entries for keys we didn't visit this run are preserved (still
  //     correct), and entries we did visit are overwritten with their new events.
  const { cursor: storedCursor, projectId: storedProjectId } = await cursorStore.load();
  const baseCursor: SyncCursor =
    mode === 'full' || !cursorMatchesProject(storedProjectId, localazyProject.id || '') ? createEmptyCursor() : storedCursor;
  // The in-memory cursor tracks only what we successfully wrote this run.
  // `cursorStore.persist` merges it with whatever's on disk before each save.
  const inMemoryCursor: SyncCursor = createEmptyCursor();

  progress({
    id: ImportProgressIds.FETCHING_TRANSLATIONS,
    message: 'Fetching translations from Localazy...',
    mode: 'upsert',
  });

  const fetchResult = await localazyContentFetcher.fetchContent({
    languages,
    enabledFields,
    localazyData,
    localazyProject,
    filterKeysForLanguage: (language, keys) => filterKeysByEventCursor(keys, baseCursor.processed_keys[language]),
  });

  if (!fetchResult.success) {
    return {
      status: 'aborted',
      itemsProcessed: 0,
      durationMs: Date.now() - startedAt,
    };
  }

  const summary = summarizeLocalazyContent(fetchResult.content);

  if (summary.changes === 0) {
    progress({
      id: ImportProgressIds.UP_TO_DATE,
      message: 'Already up to date — no changes since last sync',
      mode: 'upsert',
    });
    // Still touch `last_sync_at` so the UX / debug field reflects the most recent
    // successful run; merge-on-persist keeps the cursor itself unchanged.
    await cursorStore.persist(inMemoryCursor);
    return {
      status: 'up-to-date',
      itemsProcessed: 0,
      durationMs: Date.now() - startedAt,
      summary,
    };
  }

  progress({
    id: ImportProgressIds.CHANGES_SUMMARY,
    message: `Found ${summary.changes} changes across ${summary.languages} languages — applying to ${summary.items} items in ${summary.collections} collections`,
    mode: 'upsert',
  });

  // Throttled flush: persist every `flushEvery` keys completed (capped at 10% of
  // total work, minimum 50). Final flush happens unconditionally below.
  const totalKeys = summary.changes;
  const flushEvery = Math.max(50, Math.ceil(totalKeys / 10));
  let sinceLastFlush = 0;
  let writtenSinceStart = 0;

  const onWritten = (triples: WrittenTriple[]) => {
    triples.forEach((t) => {
      recordCursorEntry(inMemoryCursor, t.language, t.keyId, t.event);
    });
    sinceLastFlush += triples.length;
    writtenSinceStart += triples.length;
    if (sinceLastFlush >= flushEvery) {
      sinceLastFlush = 0;
      // Fire-and-forget: the next persist will reload the disk cursor anyway, and we
      // do not want write progress to stall on a slow Directus PATCH.
      void cursorStore.persist(inMemoryCursor);
    }
  };

  // Final flush — guarantees the last batch lands even if it didn't cross the
  // throttle threshold. The `finally` makes the contract literal: even if
  // the upsert throws midway, whatever the writers already accumulated via
  // `onWritten` still gets persisted.
  try {
    await upsertFromLocalazyContent({
      contentItems: fetchResult.content,
      settings,
      directusApi,
      resolveLanguageFkField,
      progress,
      onDirectusError,
      onWritten,
    });
  } finally {
    await cursorStore.persist(inMemoryCursor);
  }

  const durationMs = Date.now() - startedAt;
  const elapsedSec = (durationMs / 1000).toFixed(1);
  progress({
    id: ImportProgressIds.IMPORT_FINISHED,
    message: `Imported ${writtenSinceStart} changes across ${summary.languages} languages. ${summary.items} items updated in ${elapsedSec}s.`,
    mode: 'add',
  });

  // Analytics is fire-and-forget; the download flow shouldn't block on telemetry.
  if (reportDownloadAnalytics) {
    reportDownloadAnalytics();
  }

  return {
    status: 'completed',
    itemsProcessed: writtenSinceStart,
    durationMs,
    summary,
  };
}
