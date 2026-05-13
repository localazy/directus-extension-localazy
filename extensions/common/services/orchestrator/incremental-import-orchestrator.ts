import { Project } from '@localazy/api-client';
import { createEmptyCursor, cursorMatchesProject, filterKeysByEventCursor, recordCursorEntry } from '../../utilities/sync-cursor';
import { SyncCursor } from '../../models/collections-data/sync-state';
import { DirectusLocalazyLanguage } from '../../models/directus-localazy-language';
import { EnabledField } from '../../models/collections-data/content-transfer-setup';
import { LocalazyData } from '../../models/collections-data/localazy-data';
import { Settings } from '../../models/collections-data/settings';
import { SyncLogEntry, SyncLogLevel } from '../../models/collections-data/sync-log';
import { LockState, OrchestratorAdapters, SyncLogWriter } from './ports';
import { LocalazyContentSummary, summarizeLocalazyContent } from './summarize-localazy-content';
import { upsertFromLocalazyContent } from './upsert-localazy-content';
import { WrittenTriple } from './written-triple';
import { SYNC_LOCK_HARD_CEILING_MS, SYNC_LOCK_HEARTBEAT_MS, SYNC_LOCK_STALE_HEARTBEAT_MS } from './lock-constants';

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
  /**
   * Free-form initiator label, persisted as `sync_initiator` while the lock is held.
   * The module wires `'ui-incremental'` / `'ui-full'`; webhook flows in PR F will pass
   * `'webhook'`. Optional so existing callers that don't care about lock attribution
   * still work — the orchestrator falls back to the sync mode in that case.
   */
  initiator?: string;
};

/**
 * Shape of a completed run — used both by the public return type and by the recursive
 * re-fire path. Kept private to this module since `runIncrementalImport`'s contract is
 * the discriminated union below.
 */
type RunOutcome = {
  status: 'completed' | 'up-to-date' | 'aborted';
  itemsProcessed: number;
  durationMs: number;
  summary?: LocalazyContentSummary;
};

export type IncrementalImportResult =
  /**
   * `completed` / `up-to-date` / `aborted` mirror the legacy contract: the orchestrator
   * actually ran a sync (in some shape) and returned the usual outcome fields.
   */
  | (RunOutcome & {
      status: 'completed' | 'up-to-date' | 'aborted';
    })
  /**
   * `skipped` — the orchestrator did NOT run because the advisory lock was already held.
   * `reason: 'in_progress'` means we observed a live lock and set the dirty bit so the
   * holder re-fires us; `reason: 'race_lost'` means our CAS-acquire write was overwritten
   * by another contender between the read and re-read. Callers surface these to the UI as
   * a "sync already in progress" notification.
   */
  | { status: 'skipped'; reason: 'in_progress' | 'race_lost' };

/**
 * Opaque token generator for advisory-lock CAS. Prefers `crypto.randomUUID()` when
 * available (real UUID v4); falls back to a `Date.now() + Math.random()` composite
 * when not. The token only needs uniqueness — it isn't compared as a UUID, just
 * as a string.
 */
function generateToken(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  // Fallback path — kept minimal; the lock guards correctness even if the token isn't
  // perfectly unique because the CAS re-read still verifies our write survived.
  return `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Returns true if the on-disk lock looks stale and a contender may take over. Stale =
 * heartbeat older than `SYNC_LOCK_STALE_HEARTBEAT_MS` (Directus restart, GC pause, dead
 * worker) OR `started_at` older than `SYNC_LOCK_HARD_CEILING_MS` (zombie that keeps
 * heartbeating but never finishes — defends the 2 h hard ceiling).
 *
 * A null heartbeat / `started_at` is _not_ treated as stale on its own: the lock could
 * legitimately have been acquired microseconds ago and the first heartbeat hasn't fired
 * yet. The orchestrator only inspects this when `in_progress === true`, so a brand-new
 * acquire that hasn't heartbeated yet is correctly classified as live.
 */
function isLockStale(state: LockState, now: number): boolean {
  if (state.started_at) {
    const startedAtMs = Date.parse(state.started_at);
    if (Number.isFinite(startedAtMs) && now - startedAtMs > SYNC_LOCK_HARD_CEILING_MS) {
      return true;
    }
  }
  if (state.last_heartbeat_at) {
    const heartbeatAtMs = Date.parse(state.last_heartbeat_at);
    if (Number.isFinite(heartbeatAtMs) && now - heartbeatAtMs > SYNC_LOCK_STALE_HEARTBEAT_MS) {
      return true;
    }
  }
  return false;
}

/**
 * Per-run handle for the optional sync-log writer. The orchestrator threads this through
 * the body so milestone entries land on the persisted row. `appendInfo` / `appendError` /
 * `appendWarn` are thin level-tagged wrappers around `SyncLogWriter.appendEntry`, with
 * `void` returns so the orchestrator can call them inline without awaiting (log writes
 * never gate the sync).
 *
 * When no writer is supplied, the orchestrator uses `makeNoopLogHandle()` — every call
 * is a no-op. Keeps the orchestrator's flow free of conditional checks at every milestone.
 */
type LogHandle = {
  appendInfo(message: string, data?: Record<string, unknown>): void;
  appendWarn(message: string, data?: Record<string, unknown>): void;
  appendError(message: string, data?: Record<string, unknown>): void;
  /** Counter incremented every time `appendError` fires. Used to decide `'partial'` vs `'completed'`. */
  errorCount(): number;
};

function makeNoopLogHandle(): LogHandle {
  return {
    appendInfo() {},
    appendWarn() {},
    appendError() {},
    errorCount() {
      return 0;
    },
  };
}

function makeLogHandle(writer: SyncLogWriter, sessionId: string): LogHandle {
  let errorCount = 0;
  const append = (level: SyncLogLevel, message: string, data?: Record<string, unknown>) => {
    if (level === 'error') errorCount += 1;
    const entry: SyncLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(data ? { data } : {}),
    };
    // Fire-and-forget. The adapter swallows failures inside; we don't await so a slow
    // PATCH doesn't stall the sync's hot path.
    void writer.appendEntry(sessionId, entry);
  };
  return {
    appendInfo: (m, d) => append('info', m, d),
    appendWarn: (m, d) => append('warn', m, d),
    appendError: (m, d) => append('error', m, d),
    errorCount: () => errorCount,
  };
}

/**
 * Pure body of an import run — no lock concerns. Lifted out of `runIncrementalImport` so
 * the lock wrapper can wrap it cleanly without nesting the entire pipeline inside a
 * `try / finally`. Byte-identical to the pre-lock implementation for the on-disk
 * cursor + progress sink + analytics outcomes; the only new wire is `onItemsProcessed`,
 * which the wrapper uses to feed the heartbeat counter.
 *
 * `log` is the per-run sync-log handle. The orchestrator emits milestone-only entries
 * via this handle — sync started, fetch summary, per-collection counts, finish line, and
 * errors. The handle is a no-op when no writer was wired.
 */
async function runImportBody(
  adapters: OrchestratorAdapters,
  params: IncrementalImportParams,
  onItemsProcessed: (count: number) => void,
  log: LogHandle,
): Promise<RunOutcome> {
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

  // Milestone log: "started" line. The wording mirrors the design's section 11d so the
  // Activity page reads coherently regardless of whether the run came from UI or webhook.
  const languageCodes = languages.map((l) => l.directusForm);
  const languageList = languageCodes.length > 0 ? ` (${languageCodes.join(', ')})` : '';
  log.appendInfo(
    `${mode === 'full' ? 'Full' : 'Incremental'} sync started — ${languageCodes.length} target ${languageCodes.length === 1 ? 'language' : 'languages'}${languageList}`,
  );

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
    log.appendError('Sync aborted — fetch from Localazy failed');
    return {
      status: 'aborted',
      itemsProcessed: 0,
      durationMs: Date.now() - startedAt,
    };
  }

  const summary = summarizeLocalazyContent(fetchResult.content);

  // Milestone log: post-fetch summary. `summary.changes` here is "new since last cursor"
  // because the fetcher applies `filterKeysForLanguage` against the base cursor.
  log.appendInfo(`Fetched ${summary.changes} keys from Localazy across ${summary.languages} languages, ${summary.items} items affected`);

  if (summary.changes === 0) {
    progress({
      id: ImportProgressIds.UP_TO_DATE,
      message: 'Already up to date — no changes since last sync',
      mode: 'upsert',
    });
    log.appendInfo('Already up to date — no changes since last sync');
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

  // Per-collection / translation-string counters — only tally cursor-confirmed writes so
  // the milestone log reflects items that actually landed, not items that were attempted.
  // Mapping back from (language, keyId) to its collection requires walking the content
  // map; building a reverse index up front avoids an O(n*m) scan on every onWritten call.
  const keyIdToCollection = new Map<string, string>();
  fetchResult.content.collections.forEach((block, collectionName) => {
    Object.values(block.items).forEach((perLang) => {
      perLang.forEach((entry) => {
        entry.items.forEach((it) => {
          keyIdToCollection.set(it.localazyKey.id, collectionName);
        });
      });
    });
  });
  const writesPerCollection = new Map<string, number>();
  let writesForTranslationStrings = 0;

  const onWritten = (triples: WrittenTriple[]) => {
    triples.forEach((t) => {
      recordCursorEntry(inMemoryCursor, t.language, t.keyId, t.event);
      const collection = keyIdToCollection.get(t.keyId);
      if (collection) {
        writesPerCollection.set(collection, (writesPerCollection.get(collection) ?? 0) + 1);
      } else {
        // The triple came from translation-strings upsert, which isn't indexed in the
        // per-collection map. Bucket those separately for the milestone line below.
        writesForTranslationStrings += 1;
      }
    });
    sinceLastFlush += triples.length;
    writtenSinceStart += triples.length;
    // Surface the running total so the lock heartbeat closure can persist it without
    // reaching into the orchestrator's private state.
    onItemsProcessed(writtenSinceStart);
    if (sinceLastFlush >= flushEvery) {
      sinceLastFlush = 0;
      // Fire-and-forget: the next persist will reload the disk cursor anyway, and we
      // do not want write progress to stall on a slow Directus PATCH.
      void cursorStore.persist(inMemoryCursor);
    }
  };

  // Wrap the caller's error sink so we get per-error log entries on the persisted
  // session row in addition to the existing module-side error store. The wrap
  // intentionally calls the wrapped sink first so existing observers see errors with
  // identical timing — only the log entry is new.
  const wrappedErrorSink = (err: unknown) => {
    onDirectusError(err);
    const message = err instanceof Error ? err.message : String(err);
    log.appendError(`Upsert error: ${message}`);
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
      onDirectusError: wrappedErrorSink,
      onWritten,
    });
  } finally {
    await cursorStore.persist(inMemoryCursor);
  }

  // Milestone log: per-collection counts. Emitted after the upsert step so the numbers
  // reflect actual successful writes (counted via `onWritten`). Translation strings get
  // their own line so the Activity reader can see them as a distinct sync target.
  writesPerCollection.forEach((count, collectionName) => {
    log.appendInfo(`${collectionName}: ${count} ${count === 1 ? 'item' : 'items'} updated`);
  });
  if (writesForTranslationStrings > 0) {
    log.appendInfo(`Translation strings: ${writesForTranslationStrings} ${writesForTranslationStrings === 1 ? 'key' : 'keys'} updated`);
  }

  const durationMs = Date.now() - startedAt;
  const elapsedSec = (durationMs / 1000).toFixed(1);
  progress({
    id: ImportProgressIds.IMPORT_FINISHED,
    message: `Imported ${writtenSinceStart} changes across ${summary.languages} languages. ${summary.items} items updated in ${elapsedSec}s.`,
    mode: 'add',
  });

  // Milestone log: terminal summary line. Wording mirrors the progress modal's final
  // line so the Activity entry reads consistently with what the user saw live.
  const errorCount = log.errorCount();
  if (errorCount > 0) {
    log.appendWarn(`Sync completed with errors: ${errorCount} ${errorCount === 1 ? 'error' : 'errors'} in ${elapsedSec}s.`);
  } else {
    log.appendInfo(`Sync completed: ${writtenSinceStart} keys applied, ${summary.items} items updated in ${elapsedSec}s.`);
  }

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

/**
 * Drives the incremental-download sync end-to-end behind a CAS-style advisory lock:
 *   1. Reads the lock state. If another run is live and not stale, sets the dirty bit
 *      and returns `{ status: 'skipped', reason: 'in_progress' }` — the holder re-fires
 *      us on release.
 *   2. Acquires the lock with a fresh per-run UUID token. CAS-loss returns
 *      `{ status: 'skipped', reason: 'race_lost' }` and sets the dirty bit too.
 *   3. Starts a 30 s heartbeat `setInterval` that bumps `last_heartbeat_at` +
 *      `items_processed` so concurrent contenders can tell a live run from a zombie.
 *   4. Runs the import body (`runImportBody` — the original pre-lock pipeline).
 *   5. On exit: clears the heartbeat, releases the lock, and if the dirty bit was set
 *      during the run, re-fires the orchestrator once. The re-fire is bounded by the
 *      cursor (no new content → short-circuit) so there's no risk of an infinite loop.
 *
 * Behavioural identity with the prior implementation is preserved on the non-locked
 * path: when no contender exists, lock acquire + heartbeat + release happen around
 * exactly the same import body as before, with the same on-disk side effects.
 */
/**
 * Computes the `event_type` string the sync-log row should store for a given run mode.
 * Mirrored back from the persisted column's free-string contract — keeps the lookup
 * inline rather than pulling in an enum the orchestrator otherwise doesn't need.
 */
function eventTypeForMode(mode: SyncMode): string {
  return mode === 'full' ? 'download-full' : 'download-incremental';
}

export async function runIncrementalImport(
  adapters: OrchestratorAdapters,
  params: IncrementalImportParams,
): Promise<IncrementalImportResult> {
  const { lockStore, syncLogWriter, syncLogInitiator } = adapters;
  const initiator = params.initiator || (params.mode === 'full' ? 'ui-full' : 'ui-incremental');
  const token = generateToken();

  const existing = await lockStore.read();
  if (existing.in_progress && !isLockStale(existing, Date.now())) {
    // Live lock — set the dirty bit so the holder re-fires us, then surrender. The
    // UI surfaces the skip as a "sync already in progress" notification.
    await lockStore.markPending();
    return { status: 'skipped', reason: 'in_progress' };
  }

  const acquired = await lockStore.acquire(initiator, token);
  if (!acquired) {
    // Another contender wrote their own token between our read and the acquire — they
    // hold the lock now. Set the dirty bit so their run re-fires once it releases.
    await lockStore.markPending();
    return { status: 'skipped', reason: 'race_lost' };
  }

  // Start the sync-log session right after lock acquire. We deliberately do NOT log
  // skipped paths: when the orchestrator surrenders without acquiring the lock, the
  // holder's session row already covers the work that's running, and writing a separate
  // "skipped" row per contender would flood the Activity page during normal lock
  // contention.
  let sessionId: string | null = null;
  let log: LogHandle = makeNoopLogHandle();
  if (syncLogWriter && syncLogInitiator) {
    try {
      sessionId = await syncLogWriter.startSession({
        eventType: eventTypeForMode(params.mode),
        initiator: syncLogInitiator.initiator,
        initiatorUser: syncLogInitiator.initiatorUser,
      });
      log = makeLogHandle(syncLogWriter, sessionId);
    } catch {
      // Couldn't start a session — fall back to no-op logging. The sync still proceeds;
      // the Activity page just won't show this run. Don't surface to the user, the lock
      // holder shouldn't fail because of a log write.
    }
  }

  // Heartbeat closure reads through `currentItemsProcessed` so the in-flight counter
  // surfaces to disk between batches. Without this, `sync_items_processed` would stay
  // at zero for the whole run and external observers (Activity page in PR D, the
  // staleness check from a contender) wouldn't see progress.
  let currentItemsProcessed = 0;
  const heartbeatInterval: ReturnType<typeof setInterval> = setInterval(() => {
    // Fire-and-forget. Errors inside the heartbeat are intentionally swallowed by the
    // adapter so a transient Directus blip doesn't kill the sync.
    void lockStore.heartbeat(token, currentItemsProcessed);
  }, SYNC_LOCK_HEARTBEAT_MS);

  let runError: unknown = null;
  let outcome: RunOutcome | null = null;
  try {
    outcome = await runImportBody(
      adapters,
      params,
      (count) => {
        currentItemsProcessed = count;
      },
      log,
    );
    return outcome;
  } catch (err) {
    // Capture so the finally block can finalise the log row with a `failed` status
    // before re-throwing. Errors that escape `runImportBody` are exceptional (the body
    // itself converts upsert errors into the `partial` path via `wrappedErrorSink`),
    // but a fetch failure or a lock-state read can still throw here.
    runError = err;
    throw err;
  } finally {
    clearInterval(heartbeatInterval);

    // Release the lock BEFORE finalising the log session. The lock is the load-bearing
    // piece of state — keeping it held during `syncLogWriter.finish` would extend the
    // lock-hold duration by an HTTP PATCH + GET + bulk DELETE round-trip (the trim).
    // Trade-off: if `release` succeeds and `finish` then crashes, the log row stays
    // `in_progress` until the next run trims it out — harmless, the row is best-effort
    // observability, not state any consumer depends on. The contender heuristic uses
    // `last_heartbeat_at` and `started_at` (both on the lock row), not the log row.
    const releaseOutcome = await lockStore.release(token);

    // Finalise the log session after lock release. Wrapped in try/catch because we're
    // inside a finally — a log-finalise failure must not mask the primary error path.
    if (syncLogWriter && sessionId) {
      try {
        if (runError) {
          const message = runError instanceof Error ? runError.message : String(runError);
          log.appendError(`Sync failed: ${message}`);
          await syncLogWriter.finish(sessionId, {
            status: 'failed',
            summary: `Sync failed: ${message}`,
            itemsProcessed: currentItemsProcessed,
          });
        } else if (outcome) {
          // Status precedence: aborted / up-to-date are terminal outcomes from the body
          // and we never re-classify them as partial — the error count in those paths
          // includes the explicit "fetch failed" / "no changes" lines, which aren't
          // upsert errors. Partial only applies when we actually ran the upsert step.
          let status: string;
          if (outcome.status === 'aborted') {
            status = 'aborted';
          } else if (outcome.status === 'up-to-date') {
            status = 'skipped';
          } else {
            status = log.errorCount() > 0 ? 'partial' : outcome.status;
          }
          const elapsedSec = (outcome.durationMs / 1000).toFixed(1);
          let summary: string;
          if (outcome.status === 'aborted') {
            summary = 'Sync aborted before write phase';
          } else if (outcome.status === 'up-to-date') {
            summary = 'Already up to date — no changes since last sync';
          } else if (status === 'partial') {
            summary = `Imported ${outcome.itemsProcessed} keys with ${log.errorCount()} errors in ${elapsedSec}s`;
          } else {
            const langs = outcome.summary?.languages ?? 0;
            const items = outcome.summary?.items ?? 0;
            summary = `Imported ${outcome.itemsProcessed} keys across ${langs} ${langs === 1 ? 'language' : 'languages'}, ${items} ${items === 1 ? 'item' : 'items'} updated in ${elapsedSec}s`;
          }
          await syncLogWriter.finish(sessionId, {
            status,
            summary,
            itemsProcessed: outcome.itemsProcessed,
          });
        }
      } catch {
        // Swallow — log finalisation failure must not propagate. Worst case: the row
        // is left in `'in_progress'`. The Activity page treats stale in-progress rows
        // as visible warnings; the next successful run trims it out anyway.
      }
    }

    if (releaseOutcome.wasPending) {
      // Re-fire once. Bounded by the cursor — if nothing's new since the last
      // successful sync, the body short-circuits via the `up-to-date` path. We
      // intentionally do NOT loop here: if the re-fired run also collects a dirty
      // bit, its own release path handles it recursively, each call holding the
      // lock for the duration of a single body.
      try {
        await runIncrementalImport(adapters, params);
      } catch (err) {
        // Re-fire is a best-effort drain of the dirty bit. The cursor-bounded
        // body means a no-op re-fire is harmless; a failed re-fire shouldn't
        // mask the original run's successful outcome. Surface the error via the
        // adapter's error sink and continue. `onDirectusError` accepts only the
        // error value (no structured context), matching the `ErrorSink` shape.
        adapters.onDirectusError(err);
      }
    }
  }
}
