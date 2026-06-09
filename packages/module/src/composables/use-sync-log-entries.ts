import { computed, type Ref } from 'vue';
import type { SyncLogEntry, SyncLogLevel, SyncLogSession } from '@localazy/directus-common';

/**
 * Parses the JSON `entries` column of a sync-log session row. Tolerant — `null`,
 * `undefined`, empty strings, malformed JSON, and non-array payloads all return an
 * empty array so the detail page renders an "No log entries to display" empty state
 * rather than crashing on a bad row.
 */
export function parseSyncLogEntries(entriesJson: string | null | undefined): SyncLogEntry[] {
  if (!entriesJson) return [];
  try {
    const parsed: unknown = JSON.parse(entriesJson);
    return Array.isArray(parsed) ? (parsed as SyncLogEntry[]) : [];
  } catch {
    return [];
  }
}

/**
 * Locale-aware time-of-day formatter for sync-log entry timestamps. Returns the input
 * string unchanged when it isn't parseable so the detail page shows the raw value
 * rather than a misleading "Invalid Date".
 */
export function formatSyncLogEntryTime(ts: string): string {
  const ms = Date.parse(ts);
  if (!Number.isFinite(ms)) return ts;
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Directus icon name for a sync-log entry level. Unknown levels fall through to the
 * `info` icon — defensive, since a future level shouldn't disappear from the UI before
 * the mapping is taught.
 */
export function iconForSyncLogLevel(level: SyncLogLevel): string {
  if (level === 'error') return 'error_outline';
  if (level === 'warn') return 'warning_amber';
  return 'info';
}

/**
 * View-model for the Activity detail page's entries list. Bundles the reactive parse
 * of the session-row's `entries` column with the two pure formatters used in the
 * template, so the page binds a single composable rather than three named imports
 * plus an inline `computed`.
 */
export function useSyncLogEntries(session: Ref<SyncLogSession | null>) {
  const entries = computed(() => parseSyncLogEntries(session.value?.entries));
  return {
    entries,
    formatTime: formatSyncLogEntryTime,
    iconForLevel: iconForSyncLogLevel,
  };
}
