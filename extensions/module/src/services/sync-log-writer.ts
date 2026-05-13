import { SYNC_LOG_RETENTION, SyncLogEntry } from '../../../common/models/collections-data/sync-log';
import { SyncLogWriter } from '../../../common/services/orchestrator/ports';

/**
 * Minimal HTTP surface this module talks through. Modelled after the slice of
 * `useApi()`'s axios-like client we actually use here, so unit tests can supply a
 * trivial fake without pulling in Directus' SDK.
 *
 * `get` returns whatever Directus serves on the requested URL — a single row object
 * for `/items/{collection}/{id}`, an array for `/items/{collection}`. The writer
 * narrows downstream.
 */
export interface SyncLogHttpClient {
  post(url: string, data: unknown): Promise<{ data: { data: { id: string } } }>;
  patch(url: string, data: unknown): Promise<unknown>;
  get(url: string, config?: { params?: Record<string, unknown> }): Promise<{ data: { data: unknown } }>;
  delete(url: string, config?: { data?: unknown }): Promise<unknown>;
}

/**
 * Opaque session-id generator. Prefers `crypto.randomUUID()` (real UUID v4) when
 * available; falls back to a `Date.now() + Math.random()` composite otherwise. The id
 * is only used as a primary key — uniqueness is enough, no UUID semantics required.
 */
function generateSessionId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Pure helper: parse the current `entries` JSON, append the new entry, return the
 * re-serialised string. Extracted so tests can verify the read-modify-write contract
 * without standing up Directus / axios.
 *
 * Bad input is treated as `[]` — a corrupted entries column shouldn't fail the sync,
 * and the next `finish` will overwrite the bad state with a fresh array.
 */
export function appendEntryToJson(currentEntriesJson: string, entry: SyncLogEntry): string {
  let parsed: SyncLogEntry[] = [];
  try {
    const candidate: unknown = JSON.parse(currentEntriesJson || '[]');
    if (Array.isArray(candidate)) parsed = candidate as SyncLogEntry[];
  } catch {
    parsed = [];
  }
  parsed.push(entry);
  return JSON.stringify(parsed);
}

/**
 * Pure helper: given a list of row ids ordered newest-first, returns the ids that fall
 * past the retention window and should be deleted. Always retains the first
 * `SYNC_LOG_RETENTION` rows; everything past index `SYNC_LOG_RETENTION - 1` is trimmed.
 *
 * Extracted so the trim logic is testable without the Directus client. The writer
 * itself does one GET (to fetch ids ordered by `started_at desc`) and one DELETE
 * (the bulk delete) — both wrapped in try/catch because trim failures must not
 * propagate.
 */
export function idsToTrim(idsOrderedNewestFirst: string[]): string[] {
  if (idsOrderedNewestFirst.length <= SYNC_LOG_RETENTION) return [];
  return idsOrderedNewestFirst.slice(SYNC_LOG_RETENTION);
}

type CreateSyncLogWriterInput = {
  api: SyncLogHttpClient;
  collectionName: string;
  /**
   * Optional id factory. Production code lets the writer mint UUIDs internally;
   * tests inject deterministic ids so assertions are stable.
   */
  generateId?: () => string;
};

/**
 * Module-side `SyncLogWriter` implementation. Talks to Directus via the supplied
 * axios-like client (`useApi()` in production, a fake in tests). Behaviour:
 *
 *   - `startSession` POSTs a new row with `status: 'in_progress'`, the supplied
 *     metadata, and an empty `entries: '[]'`. Returns the new row's id.
 *   - `appendEntry` reads the current `entries`, parses it, pushes the new entry, and
 *     PATCHes the row back. Per-call PATCH is fine for milestone-only logging
 *     (PR D scope) — ≤20 entries per session typical.
 *   - `finish` PATCHes `status`, `finished_at`, `summary`, `items_processed` in one
 *     write, then GETs the full id list ordered by `started_at desc` and DELETEs
 *     everything past index 99 (`SYNC_LOG_RETENTION`).
 *
 * `appendEntry` and `finish` swallow errors — log writes must not take down a sync.
 * `startSession` propagates errors because the orchestrator needs a valid session id to
 * thread through subsequent calls. The orchestrator never awaits log writes inside the
 * hot loop, so a stalled adapter can only delay milestone entries, never the
 * user-facing import.
 */
export function createSyncLogWriter(input: CreateSyncLogWriterInput): SyncLogWriter {
  const { api, collectionName, generateId = generateSessionId } = input;

  async function fetchEntriesJson(sessionId: string): Promise<string> {
    // Re-throw GET errors so `doAppend` bails out without writing. Previously this
    // swallowed the error and returned `'[]'`, which caused the subsequent PATCH to
    // overwrite the on-disk entries with a single-element array on transient GET
    // failures. The outer try/catch in `doAppend` still swallows the error so the
    // sync isn't taken down — but the PATCH is correctly skipped.
    const result = await api.get(`/items/${collectionName}/${sessionId}`);
    const row = (result.data.data ?? {}) as { entries?: string };
    return row.entries ?? '[]';
  }

  async function trimToRetention(): Promise<void> {
    try {
      const list = await api.get(`/items/${collectionName}`, {
        params: {
          limit: -1,
          sort: '-started_at',
          fields: ['id'],
        },
      });
      const rows = (list.data.data ?? []) as Array<{ id: string }>;
      const ids = rows.map((row) => row.id);
      const toTrim = idsToTrim(ids);
      if (toTrim.length === 0) return;
      await api.delete(`/items/${collectionName}`, { data: toTrim });
    } catch {
      // Trim is best-effort. If it fails the table just grows a little past 100 —
      // the next finish will retry. Surfacing the error would mask the sync's real
      // outcome.
    }
  }

  // Per-session promise chain. The orchestrator emits `appendEntry` fire-and-forget at
  // milestone boundaries, so two callbacks fired in quick succession can have their
  // GET → mutate → PATCH cycles interleave — the second PATCH would clobber the first's
  // append. The chain serialises calls within a single session id without blocking
  // appends across distinct sessions.
  const appendChains = new Map<string, Promise<void>>();

  async function doAppend(sessionId: string, entry: SyncLogEntry): Promise<void> {
    try {
      const currentEntries = await fetchEntriesJson(sessionId);
      const next = appendEntryToJson(currentEntries, entry);
      await api.patch(`/items/${collectionName}/${sessionId}`, { entries: next });
    } catch {
      // Swallow at this level — a single failed append must not take down the sync. If
      // the GET re-throws (see `fetchEntriesJson` below) we explicitly skip the PATCH
      // so the on-disk entries aren't overwritten with a single-element array.
    }
  }

  return {
    async startSession(params) {
      const id = generateId();
      await api.post(`/items/${collectionName}`, {
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
      // Chain this call after any in-flight append for the same session. We deliberately
      // catch the prior's error so a single failure can't poison subsequent appends.
      const next = prior.catch(() => undefined).then(() => doAppend(sessionId, entry));
      appendChains.set(sessionId, next);
      // Cleanup map entry once this call settles (success or failure) so the map doesn't
      // grow unbounded across long-running sessions.
      void next.finally(() => {
        if (appendChains.get(sessionId) === next) {
          appendChains.delete(sessionId);
        }
      });
      return next;
    },

    async finish(sessionId, params) {
      try {
        await api.patch(`/items/${collectionName}/${sessionId}`, {
          status: params.status,
          finished_at: new Date().toISOString(),
          summary: params.summary,
          items_processed: params.itemsProcessed,
        });
      } catch {
        // Even finalisation is best-effort — a left-in-progress row is fine for the
        // Activity page (the user sees the stale status, the next run clears it via
        // the retention trim).
      }
      await trimToRetention();
    },
  };
}
