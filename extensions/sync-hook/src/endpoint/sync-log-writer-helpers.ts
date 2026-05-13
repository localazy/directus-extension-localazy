import { SYNC_LOG_RETENTION, SyncLogEntry } from '../../../common/models/collections-data/sync-log';

/**
 * Pure helper: parse the current `entries` JSON, append the new entry, return the
 * re-serialised string. Mirror of the module-side `appendEntryToJson` so both adapters
 * have identical per-append semantics.
 *
 * Bad input is treated as `[]` — a corrupted entries column shouldn't fail the sync.
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
 * past the retention window. Mirror of the module-side `idsToTrim` so both adapters trim
 * identically.
 */
export function idsToTrim(idsOrderedNewestFirst: string[]): string[] {
  if (idsOrderedNewestFirst.length <= SYNC_LOG_RETENTION) return [];
  return idsOrderedNewestFirst.slice(SYNC_LOG_RETENTION);
}
