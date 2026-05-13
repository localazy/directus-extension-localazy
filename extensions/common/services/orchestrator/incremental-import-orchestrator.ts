import { Project } from '@localazy/api-client';
import { createEmptyCursor, cursorMatchesProject, filterKeysByEventCursor, recordCursorEntry } from '../../utilities/sync-cursor';
import { SyncCursor } from '../../models/collections-data/sync-state';
import { DirectusLocalazyLanguage } from '../../models/directus-localazy-language';
import { EnabledField } from '../../models/collections-data/content-transfer-setup';
import { LocalazyData } from '../../models/collections-data/localazy-data';
import { Settings } from '../../models/collections-data/settings';
import { LockState, OrchestratorAdapters } from './ports';
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
 * UUID v4 generator. Falls back to a `Math.random()`-based string when `crypto.randomUUID`
 * isn't available — the only consumer is the lock token, which only needs to be unique
 * within the contender pool of a single Directus instance, not cryptographically random.
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
 * Pure body of an import run — no lock concerns. Lifted out of `runIncrementalImport` so
 * the lock wrapper can wrap it cleanly without nesting the entire pipeline inside a
 * `try / finally`. Byte-identical to the pre-lock implementation for the on-disk
 * cursor + progress sink + analytics outcomes; the only new wire is `onItemsProcessed`,
 * which the wrapper uses to feed the heartbeat counter.
 */
async function runImportBody(
  adapters: OrchestratorAdapters,
  params: IncrementalImportParams,
  onItemsProcessed: (count: number) => void,
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
export async function runIncrementalImport(
  adapters: OrchestratorAdapters,
  params: IncrementalImportParams,
): Promise<IncrementalImportResult> {
  const { lockStore } = adapters;
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

  try {
    const outcome = await runImportBody(adapters, params, (count) => {
      currentItemsProcessed = count;
    });
    return outcome;
  } finally {
    clearInterval(heartbeatInterval);
    const { wasPending } = await lockStore.release(token);
    if (wasPending) {
      // Re-fire once. Bounded by the cursor — if nothing's new since the last
      // successful sync, the body short-circuits via the `up-to-date` path. We
      // intentionally do NOT loop here: if the re-fired run also collects a dirty
      // bit, its own release path handles it recursively, each call holding the
      // lock for the duration of a single body.
      await runIncrementalImport(adapters, params);
    }
  }
}
