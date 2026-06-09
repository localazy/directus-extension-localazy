import { SyncLogEntry, SyncLogSession } from '../../models/collections-data/sync-log';
import { appendEntryToJson, idsToTrim } from '../../utilities/sync-log-helpers';
import { SyncLogStartParams, SyncLogWriter } from './ports';

/**
 * Terminal-status set that callers consider a failure outcome. Exported so adapter-side
 * tests and the bundle's `onFailure` callback can share the discrimination without
 * duplicating the literal.
 */
export const FAILURE_STATUSES: ReadonlySet<string> = new Set(['failed', 'partial', 'aborted']);

/**
 * Terminal-state fields written to a Sync-log session row by `writeFinish`. Mirrors the
 * relevant subset of `SyncLogSession`; kept narrow so the storage adapter doesn't have to
 * accept (and ignore) immutable fields like `id` or `started_at`.
 */
export type SyncLogFinishFields = {
  status: string;
  finished_at: string;
  summary: string;
  items_processed: number;
};

/**
 * Storage transport for the Sync-log writer. Each method is column-aware on purpose — the
 * writer's body reads top-to-bottom in domain terms (`storage.writeEntries(id, json)`
 * rather than `storage.update(id, { entries: json })`), and fake implementations in tests
 * assert on intent rather than opaque payloads.
 *
 * Two adapters satisfy this seam in production: an axios-backed adapter on the Module side
 * (browser, `useApi()`), and an `ItemsService`-backed adapter on the Sync-hook bundle side
 * (Directus' Node runtime, with `emitEvents: false` baked in so write-back doesn't recurse
 * through the upload hook). Adapters are not interchangeable across runtimes — that's why
 * the seam exists.
 */
export interface SyncLogStorage {
  /** Insert a freshly-minted session row. The row's `id` is the writer's pre-generated UUID. */
  createSession(row: SyncLogSession): Promise<void>;
  /** Return the row's `entries` JSON string. Throw on read failure (the writer skips the write). */
  readEntries(id: string): Promise<string>;
  /** Overwrite the row's `entries` column with the supplied JSON string. */
  writeEntries(id: string, entriesJson: string): Promise<void>;
  /** Patch the terminal-state fields on the session row. */
  writeFinish(id: string, fields: SyncLogFinishFields): Promise<void>;
  /** List all session ids ordered newest-first by `started_at`. Used by the retention trim. */
  listIdsByStartedAtDesc(): Promise<string[]>;
  /** Bulk-delete the supplied session ids. The trim never calls this with an empty list. */
  deleteByIds(ids: string[]): Promise<void>;
}

/**
 * Terminal-state parameters supplied to `finish` by the caller (the orchestrator). Mirrors
 * the `SyncLogWriter.finish` port's signature so the orchestrator and the writer share the
 * same vocabulary.
 */
export type SyncLogFinishParams = {
  status: string;
  summary: string;
  itemsProcessed: number;
};

/**
 * Fired after a session reaches a failure terminal state (`failed`, `partial`, `aborted`)
 * and after the retention trim has run. The callback owns its own error handling and
 * notification dispatch — the writer is responsible only for invoking it at the right
 * point in `finish()` and ensuring callback errors never propagate out.
 *
 * Used today by the Sync-hook bundle's adapter to emit a `directus_notifications` row
 * addressed to the configured Webhook user. The Module side passes nothing.
 */
export type SyncLogFailureCallback = (sessionId: string, params: SyncLogFinishParams) => Promise<void>;

export type CreateSyncLogWriterInput = {
  /** The storage adapter. */
  storage: SyncLogStorage;
  /**
   * Session-id factory. Required — `common/` doesn't reach for any UUID source itself so
   * each runtime supplies the right one (`crypto.randomUUID` in the browser,
   * `node:crypto`'s `randomUUID` on the server, deterministic ids in tests).
   */
  generateId: () => string;
  /** Optional hook fired on failure-status finish. See `SyncLogFailureCallback`. */
  onFailure?: SyncLogFailureCallback;
};

/**
 * Deep Sync-log writer — the single home of session-persistence orchestration shared by
 * both the Module and the Sync-hook bundle. Owns:
 *
 *   - The per-session promise chain that serialises read-modify-write `appendEntry` calls
 *     so two fire-and-forget callers can't interleave their cycles.
 *   - The error-swallowing contract: `startSession` propagates (the orchestrator needs the
 *     id), `appendEntry` and `finish` never throw, `readEntries` errors short-circuit the
 *     subsequent write so a transient GET failure can't overwrite the on-disk entries with
 *     a single-element array.
 *   - The retention trim on `finish` (best-effort — failures swallowed, next finish retries).
 *   - The `onFailure` hook invocation order: terminal write → trim → callback, with
 *     callback errors swallowed so finalisation never propagates.
 *
 * The transport adapter (`SyncLogStorage`) is the only varying surface; everything above
 * is fixed here.
 */
export function createSyncLogWriter(input: CreateSyncLogWriterInput): SyncLogWriter {
  const { storage, generateId, onFailure } = input;
  // Per-session append chain. The orchestrator emits `appendEntry` fire-and-forget at
  // milestone boundaries, so two callbacks fired in quick succession can have their
  // read-modify-write cycles interleave — the second write would clobber the first's
  // append. The chain serialises calls within a single session id without blocking
  // appends across distinct sessions.
  const appendChains = new Map<string, Promise<void>>();

  async function doAppend(sessionId: string, entry: SyncLogEntry): Promise<void> {
    try {
      // If `readEntries` throws, the surrounding try/catch aborts before `writeEntries`
      // runs — a transient read failure must not lead to the entries column being
      // overwritten with a fresh single-element array. The adapter contract documents the
      // re-throw on read failure for this reason.
      const current = await storage.readEntries(sessionId);
      const next = appendEntryToJson(current, entry);
      await storage.writeEntries(sessionId, next);
    } catch {
      // Swallow at this level — a single failed append must not take down the sync.
    }
  }

  async function trimToRetention(): Promise<void> {
    try {
      const ids = await storage.listIdsByStartedAtDesc();
      const toTrim = idsToTrim(ids);
      if (toTrim.length === 0) return;
      await storage.deleteByIds(toTrim);
    } catch {
      // Trim is best-effort. If it fails the table just grows a little past retention —
      // the next finish will retry. Surfacing the error would mask the sync's outcome.
    }
  }

  return {
    async startSession(params: SyncLogStartParams): Promise<string> {
      const id = generateId();
      await storage.createSession({
        id,
        event_type: params.eventType,
        status: 'in_progress',
        started_at: new Date().toISOString(),
        finished_at: null,
        initiator: params.initiator,
        initiator_user: params.initiatorUser,
        summary: '',
        items_processed: 0,
        entries: '[]',
      });
      return id;
    },

    async appendEntry(sessionId, entry) {
      const prior = appendChains.get(sessionId) ?? Promise.resolve();
      // Chain this call after any in-flight append for the same session. Catching the
      // prior's error means a single failure can't poison subsequent appends.
      const next = prior.catch(() => undefined).then(() => doAppend(sessionId, entry));
      appendChains.set(sessionId, next);
      // Clean up once this call settles so the map doesn't grow unbounded across
      // long-running sessions.
      void next.finally(() => {
        if (appendChains.get(sessionId) === next) {
          appendChains.delete(sessionId);
        }
      });
      return next;
    },

    async finish(sessionId, params) {
      try {
        await storage.writeFinish(sessionId, {
          status: params.status,
          finished_at: new Date().toISOString(),
          summary: params.summary,
          items_processed: params.itemsProcessed,
        });
      } catch {
        // Even finalisation is best-effort — a left-in-progress row is fine for the
        // Activity page (the user sees the stale status, the next run clears it via the
        // retention trim).
      }
      await trimToRetention();

      if (onFailure && FAILURE_STATUSES.has(params.status)) {
        try {
          await onFailure(sessionId, params);
        } catch {
          // The callback owns its own logging. Swallow here so a failed notification can't
          // propagate up into the orchestrator's `finally` and mask the primary outcome.
        }
      }
    },
  };
}
