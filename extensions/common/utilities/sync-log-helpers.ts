import { SYNC_LOG_RETENTION, SyncLogEntry } from '../models/collections-data/sync-log';

/**
 * Pure helper: parse the current `entries` JSON, append the new entry, return the
 * re-serialised string. Shared between the module-side and server-side `SyncLogWriter`
 * adapters so both surfaces have identical per-append semantics.
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
 * Shared between the module-side and server-side writers so both trim identically.
 */
export function idsToTrim(idsOrderedNewestFirst: string[]): string[] {
  if (idsOrderedNewestFirst.length <= SYNC_LOG_RETENTION) return [];
  return idsOrderedNewestFirst.slice(SYNC_LOG_RETENTION);
}
