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
 * Upload-sync cursor data, indexed by (collection, itemId). The recorded string is a
 * 16-hex-character truncated SHA-256 of the canonical KV payload that would currently be
 * uploaded to Localazy for that item. On the next upload sync we skip any (collection,
 * itemId) whose currently-computed hash matches the stored value — meaning nothing about
 * the upload payload has changed since the last successful push.
 *
 * Hash inputs intentionally include everything that affects the wire payload (enabled
 * fields, source-language code, `upload_existing_translations` mode, the per-item field
 * values), so any user-facing change (settings, schema, content edits) naturally yields a
 * different hash and a re-push.
 */
export type UploadCursor = {
  /** `{ [collection]: { [itemId]: hexHash16 } }` */
  uploaded_hashes: Record<string, Record<string, string>>;
};

/**
 * Shape of the `localazy_sync_state` singleton row. Persisted as a single record per
 * Directus install; the download cursor is serialized as JSON in `processed_keys`, the
 * upload cursor in `uploaded_hashes`.
 */
export type SyncState = {
  /** JSON-encoded `SyncCursor['processed_keys']`. Default `'{}'`. */
  processed_keys: string;
  /** JSON-encoded `UploadCursor['uploaded_hashes']`. Default `'{}'`. */
  uploaded_hashes: string;
  /**
   * Localazy project id the cursor was last written against. If it changes (user
   * reconnected to a different project), the next sync auto-invalidates the cursor.
   * Shared between download and upload — both flows invalidate on project change.
   */
  cursor_project_id: string;
  /** Schema version of the cursor data. Bump when the storage shape changes. */
  cursor_version: number;
  /** ISO timestamp of the last successful download sync. */
  last_sync_at: string | null;
};

export const CURSOR_VERSION = 1;
