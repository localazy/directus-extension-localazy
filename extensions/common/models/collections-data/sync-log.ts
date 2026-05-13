/**
 * Per-session entry levels emitted by the orchestrator (and future webhook handler). The
 * Activity page filters / colours entries by level; new levels can be added without a
 * schema migration because `entries` is JSON-encoded text on the row.
 */
export type SyncLogLevel = 'info' | 'warn' | 'error';

/**
 * Single log entry inside a `SyncLogSession.entries` array. `data` is intentionally
 * `Record<string, unknown>` rather than a typed shape — callers attach whatever
 * context happens to be useful at the call site (item id, error message, language
 * code, …), and the Activity detail page renders it as pretty-printed JSON.
 */
export type SyncLogEntry = {
  /** ISO timestamp. Serialised as a string so the JSON column survives Directus' transform. */
  timestamp: string;
  level: SyncLogLevel;
  message: string;
  /** Optional structured payload, rendered as JSON below the message in the detail view. */
  data?: Record<string, unknown>;
};

/**
 * Shape of a `localazy_sync_log` row. All status / event-type strings are free-form by
 * design — `event_type` is a free string so PR F's webhook flow and any future initiators
 * can extend the vocabulary without a schema change. The Activity UI maps a known prefix
 * set (`upload-`, `download-`, `webhook`) to its tab groupings.
 *
 * `entries` is stored as a JSON-encoded string (column type `text`). Read-modify-write on
 * append is acceptable here: PR D scope is milestone-only logging — 10-20 entries per
 * session typical, no hot loop appending — so we don't need a separate row-per-entry
 * collection.
 */
export type SyncLogSession = {
  id: string;
  /** `'upload-incremental' | 'upload-full' | 'download-incremental' | 'download-full' | 'webhook'` — free string. */
  event_type: string;
  /** `'in_progress' | 'completed' | 'failed' | 'partial' | 'aborted' | 'skipped'` — free string. */
  status: string;
  started_at: string;
  finished_at: string | null;
  /** `'webhook'` or a Directus user id. UI-triggered runs also populate `initiator_user`. */
  initiator: string;
  /** Directus user id when UI-triggered; null for webhook-initiated runs. */
  initiator_user: string | null;
  summary: string;
  items_processed: number;
  /** JSON-encoded `SyncLogEntry[]`. Default `'[]'`. */
  entries: string;
};

/**
 * Maximum sessions retained on disk. The module-side `SyncLogWriter.finish` trims
 * everything past this index after the most recent run completes. Kept low to match the
 * Strapi behaviour (last 100 sessions) and to avoid unbounded growth — the Activity page
 * is designed for recent debugging, not long-term audit.
 */
export const SYNC_LOG_RETENTION = 100;
