/**
 * Sync cursor data, indexed by (language, Localazy key id). The recorded number is the
 * `event` value of the most recently applied modification for that (language, key) pair.
 *
 * On the next download sync we skip any (language, key) whose stored event is `>=` the
 * one returned by the API — i.e. we only fetch translations modified since we last wrote
 * them. Cells with `undefined` storedEvent or `undefined` API event are always treated as
 * "needs sync" (safe mode), preserving correctness if the server ever omits the field.
 */
export type SyncCursor = {
  /** `{ [lang]: { [localazyKeyId]: lastProcessedEventNumber } }` */
  processed_keys: Record<string, Record<string, number>>;
};

/**
 * Shape of the `localazy_sync_state` singleton row. Persisted as a single record per
 * Directus install; the cursor is serialized as JSON in `processed_keys`.
 */
export type SyncState = {
  /** JSON-encoded `SyncCursor['processed_keys']`. Default `'{}'`. */
  processed_keys: string;
  /**
   * Localazy project id the cursor was last written against. If it changes (user
   * reconnected to a different project), the next sync auto-invalidates the cursor.
   */
  cursor_project_id: string;
  /** Schema version of the cursor data. Bump when the storage shape changes. */
  cursor_version: number;
  /** ISO timestamp of the last successful download sync. */
  last_sync_at: string | null;
};

export const CURSOR_VERSION = 1;
