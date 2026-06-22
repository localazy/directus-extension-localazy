import { Key, Project } from '@localazy/api-client';
import { DirectusApi } from '../../interfaces/directus-api';
import { DirectusLocalazyLanguage } from '../../models/directus-localazy-language';
import { EnabledField } from '../../models/collections-data/content-transfer-setup';
import { LocalazyData } from '../../models/collections-data/localazy-data';
import { LocalazyContent } from '../../models/localazy-content';
import { SyncCursor } from '../../models/collections-data/sync-state';
import { SyncLogEntry } from '../../models/collections-data/sync-log';

/**
 * Cursor I/O port. Both the read side (`load`) and the write side (`persist`) are async
 * because the module-side Pinia store and the future server-side `ItemsService` adapter
 * both round-trip the singleton row over the wire / through a transaction. The orchestrator
 * doesn't care about the storage backend — it just needs the current cursor + the project
 * id it was written against, and a way to save updates.
 *
 * `persist` is expected to implement merge-on-persist semantics — re-read the latest
 * on-disk cursor, take `max(event)` per cell, write back — so two concurrent runs never
 * clobber each other. The orchestrator hands `persist` only the in-memory cursor of the
 * current run; the merge happens inside the adapter.
 */
export interface CursorStore {
  /**
   * Returns the latest on-disk cursor and the project id it was written against. The
   * orchestrator uses the project id to auto-invalidate when the user reconnects to a
   * different Localazy project.
   */
  load(): Promise<{ cursor: SyncCursor; projectId: string }>;
  /**
   * Persist the in-memory cursor (orchestrator's accumulated writes for the current run).
   * The implementation is expected to re-read the latest on-disk state, merge with this
   * input cell-by-cell (max-event-wins), and write the result back. Errors are intentionally
   * swallowed by the adapter — a flush failure shouldn't take down a sync, the next flush
   * will retry, and the orchestrator's final flush in `finally` is a last-resort backstop.
   */
  persist(cursor: SyncCursor): Promise<void>;
}

/**
 * Parameters the Localazy content fetcher receives. The shape mirrors the existing
 * `importContentFromLocalazy` interface so adapters can pass these through verbatim.
 * The optional `filterKeysForLanguage` is injected by the orchestrator and applies the
 * cursor-based incremental filter before parsing.
 */
export type FetchLocalazyContentInput = {
  languages: DirectusLocalazyLanguage[];
  enabledFields: EnabledField[];
  localazyData: LocalazyData;
  localazyProject: Project;
  filterKeysForLanguage?: (language: string, keys: Key[]) => Key[];
};

export type FetchLocalazyContentResult = { success: true; content: LocalazyContent } | { success: false };

/**
 * Wraps the existing Localazy file/keys fetch + parse pipeline. The module adapter wires
 * this to `importFromLocalazyService.importContentFromLocalazy(...)`; the future server
 * adapter will call the same service through the hook's Node-side runtime.
 */
export interface LocalazyContentFetcher {
  fetchContent(input: FetchLocalazyContentInput): Promise<FetchLocalazyContentResult>;
}

/** Progress message severity. */
export type ProgressLevel = 'info' | 'warn' | 'error';

/** Numeric id the progress tracker uses to de-dupe / upsert messages. */
export type ProgressId = number | string;

/**
 * Progress callback. The orchestrator emits one call per state transition; the module
 * adapter routes it to the Pinia progress-tracker store, the server adapter will route it
 * to log lines / future activity-log rows. `id` enables in-place updates (e.g. the
 * "Updating {collection} (i/n)" line being replaced as items are written).
 */
export type ProgressSink = (message: { id: ProgressId; message: string; level?: ProgressLevel; mode?: 'add' | 'upsert' }) => void;

/**
 * Resolves the FK column on a translation collection that points back at the languages
 * collection. The Directus convention is `languages_code`, but real-world installs often
 * use a different name (`lang_code`, `language`, etc.) — hardcoding breaks them.
 *
 * Module adapter wires this through the Pinia relations store; server adapter will read
 * `schema.relations`. Returning `'languages_code'` as the fallback preserves the existing
 * behaviour when the relation can't be located.
 */
export type ResolveLanguageFkField = (parentCollection: string, translationField: string, languagesCollection: string) => string;

/**
 * Sink for non-fatal errors that occur during the upsert step. Both error paths in the
 * existing code routed to `useErrorsStore()`; lifting splits that responsibility — the
 * orchestrator hands errors back through this port, the module adapter relays them to the
 * Pinia errors store.
 *
 * The optional `context` carries *where* the error happened so the UI can deep-link to the
 * record (see `DirectusErrorContext`). Widening is backward-compatible: existing one-arg
 * sinks remain assignable and callers may still invoke with a single argument.
 */
export type DirectusErrorContext = {
  /** Parent collection the failing PATCH targeted — used for a Directus item deep-link. */
  collection?: string;
  /** Parent item id the failing PATCH targeted. */
  itemId?: string | number;
  /** Languages whose translations were in the failed batch (from the write triples). */
  languages?: string[];
};

export type ErrorSink = (error: unknown, context?: DirectusErrorContext) => void;

/**
 * Snapshot of the advisory sync lock. Mirrors the persisted `localazy_sync_state` row
 * one-to-one. The orchestrator reads this once at the start of `run()` to decide whether
 * to acquire, skip-and-mark-pending, or take over a stale lock.
 */
export type LockState = {
  in_progress: boolean;
  /** ISO timestamp of the most recent acquire, or `null` if the lock is free. */
  started_at: string | null;
  /** Free-form initiator label (`'ui-incremental'`, `'ui-full'`, future `'webhook'`). */
  initiator: string;
  /** Dirty bit — a contender saw a live lock and wants the holder to re-fire once on release. */
  pending: boolean;
  /** Counter reset to 0 at acquire, bumped by the heartbeat from the current run. */
  items_processed: number;
  /** ISO timestamp of the last `setInterval` heartbeat, or `null` until the first one fires. */
  last_heartbeat_at: string | null;
  /**
   * Per-run UUID. Acquire writes a fresh value; heartbeat / release no-op if the on-disk
   * token doesn't match (the lock has rotated to another initiator since the caller's read).
   */
  acquired_token: string;
};

/**
 * Advisory lock port. The orchestrator uses this to serialise concurrent Import flows
 * (UI clicks today, webhook callbacks in PR F) without depending on a SQL-level lock —
 * the lock state is a single row on the `localazy_sync_state` singleton.
 *
 * The contract is intentionally CAS-shaped: `acquire` returns the token only if our write
 * survived a read-back, so two simultaneous contenders never both think they hold the
 * lock. `heartbeat` and `release` are token-gated so a stale holder (the one whose run
 * exceeded the 2 h ceiling and got stolen) can't clobber the new holder's state.
 */
export interface LockStore {
  /** Returns the latest on-disk lock snapshot. The orchestrator decides what to do next. */
  read(): Promise<LockState>;
  /**
   * CAS-style acquire. Writes the supplied `(initiator, token)` plus zeroed counters /
   * timestamps, re-reads the row, and returns the token if `acquired_token` matches. If
   * another contender beat us between read and re-read, returns `null` and the caller
   * surrenders.
   */
  acquire(initiator: string, token: string): Promise<string | null>;
  /**
   * Token-gated heartbeat. Bumps `last_heartbeat_at` and overwrites `items_processed`
   * with the caller's running total. No-op (and never throws) if the on-disk
   * `acquired_token` no longer matches — the lock has been stolen, and the previous
   * holder must not touch state.
   */
  heartbeat(token: string, itemsProcessed: number): Promise<void>;
  /**
   * Token-gated release. Clears `in_progress`, `acquired_token`, and the dirty bit, then
   * returns the `pending` value as it stood _before_ the clear so the caller can decide
   * whether to re-fire. No-op (returns `{ wasPending: false }`) if the on-disk token
   * doesn't match.
   */
  release(token: string): Promise<{ wasPending: boolean }>;
  /**
   * Marks the dirty bit so the current holder re-fires once on release. Used by a
   * contender that hit a live, non-stale lock.
   */
  markPending(): Promise<void>;
}

/**
 * Parameters passed to `SyncLogWriter.startSession`. Kept narrow on purpose — the
 * `eventType` is a free string mirroring the persisted `event_type` column, so PR F's
 * webhook flow can pass `'webhook'` without coordinating with the orchestrator.
 *
 * `initiatorUser` is the Directus user id for UI-triggered runs; webhook flows pass
 * `null` and the row's `initiator` column carries the `'webhook'` label.
 */
export type SyncLogStartParams = {
  eventType: string;
  initiator: string;
  initiatorUser: string | null;
};

/**
 * Persistent sink for retroactive activity-log viewing. Separate from `ProgressSink` —
 * the progress sink feeds the live progress modal (transient, UI-bound), the sync-log
 * writer persists milestone entries that the Activity page renders after the fact.
 *
 * Implementations are expected to:
 *   1. POST a `localazy_sync_log` row on `startSession`, returning the row id.
 *   2. Read-modify-write the `entries` JSON array on `appendEntry`. PR D logs are
 *      milestone-only (≤20 entries per session typical), so a per-call PATCH is fine.
 *   3. Finalise the row on `finish` — set `status`, `finished_at`, `summary`,
 *      `items_processed`, and trim the table to `SYNC_LOG_RETENTION` rows.
 *
 * `startSession` and `finish` are awaited at lock-acquire and lock-release boundaries.
 * `appendEntry` calls inside the orchestrator's body are fire-and-forget
 * (`void writer.appendEntry(...)`) so milestone emission doesn't pace the sync. A failed
 * log write must not take down the sync.
 */
export interface SyncLogWriter {
  /** Creates the row with `status: 'in_progress'`. Returns the new row's id. */
  startSession(params: SyncLogStartParams): Promise<string>;
  /** Appends one entry to the session's `entries` array. */
  appendEntry(sessionId: string, entry: SyncLogEntry): Promise<void>;
  /**
   * Marks the row terminal. After a successful finalisation, the implementation should
   * also trim `localazy_sync_log` to the most recent `SYNC_LOG_RETENTION` sessions
   * (best-effort — trim failures must not propagate).
   */
  finish(sessionId: string, params: { status: string; summary: string; itemsProcessed: number }): Promise<void>;
}

/**
 * Bundle of side-effect adapters the orchestrator needs. The orchestrator file reads
 * top-to-bottom like a recipe; everything stateful is reached through one of these.
 */
export type OrchestratorAdapters = {
  cursorStore: CursorStore;
  /**
   * Advisory lock port. Held for the duration of `runIncrementalImport` (acquire on
   * entry, release in `finally`). The lock is symmetric — webhook flows in PR F will
   * take the same lock through a server-side adapter.
   */
  lockStore: LockStore;
  localazyContentFetcher: LocalazyContentFetcher;
  progress: ProgressSink;
  directusApi: DirectusApi;
  resolveLanguageFkField: ResolveLanguageFkField;
  onDirectusError: ErrorSink;
  /**
   * Fire-and-forget analytics hook. The orchestrator never awaits this — analytics latency
   * shouldn't block the user's sync. The module adapter wires it to
   * `AnalyticsService.trackDownloadFromLocalazy(...)`.
   */
  reportDownloadAnalytics?: () => void;
  /**
   * Optional persistent log writer for the Activity page. When supplied, the orchestrator
   * creates a session right after lock acquire and finalises it in `finally` — including
   * the failure path, where the session is closed with `status: 'failed'` before any
   * error propagates. Optional so callers that don't need persistent logs (some test
   * fakes, the eventual sandboxed-server path) can skip the wiring.
   *
   * The orchestrator fills in `eventType` from its own `mode` (`download-incremental` /
   * `download-full`); the caller supplies `initiator` + `initiatorUser` since only the
   * caller knows whether the run was UI-triggered (Directus user id) or webhook-triggered
   * (`null`). Required when `syncLogWriter` is set.
   */
  syncLogWriter?: SyncLogWriter;
  syncLogInitiator?: { initiator: string; initiatorUser: string | null };
};
