import { computed, ref, watch, type Ref } from 'vue';
import type { SyncLogSession } from '@localazy/directus-common';

/**
 * Tabs surfaced on the Activity page. Two-axis simplification: the tab dimension is
 * pure direction (outbound = Export, inbound = Import). Trigger source (automated vs
 * manual) lives in the "Triggered by" filter + the per-row "Triggered by" column.
 */
export type ActivityTab = 'upload' | 'download';

/**
 * Coarse classification of `localazy_sync_log.initiator` for the new "Triggered by"
 * filter. The persisted column carries free strings (`'hook'`, `'webhook'`, a Directus
 * user UUID, …); this classifier reduces them to "automated" (system-driven via hook
 * bursts or inbound webhooks) vs "manual" (user-triggered from the module UI).
 */
export type InitiatorKind = 'automated' | 'manual';

export type SortKey = 'status' | 'started_at' | 'duration' | 'initiator' | 'summary';
export type SortDirection = 'asc' | 'desc';

export type SortPreference = { key: SortKey; direction: SortDirection };

export type SortPreferences = Partial<Record<ActivityTab, SortPreference>>;

export const PAGE_SIZE = 20;

const DEFAULT_SORT: SortPreference = { key: 'started_at', direction: 'desc' };

/**
 * Maps a `localazy_sync_log.event_type` value to the Activity tab it belongs to.
 * - `upload-*` (`upload-incremental`, `upload-full`, `upload-automated`) → Export tab
 * - `download-*` (`download-incremental`, `download-full`) → Import tab
 * - `webhook` (inbound Localazy → Directus) → Import tab; semantically a download,
 *   just system-triggered. The "Triggered by" column / filter is where users
 *   distinguish webhook-driven runs from UI-driven ones.
 * - Anything else → Import tab as a safe fallback (future event types remain visible
 *   while we teach the mapping).
 *
 * Pure helper so the tab-routing logic stays testable.
 */
export function tabForEventType(eventType: string): ActivityTab {
  if (eventType.startsWith('upload')) return 'upload';
  return 'download';
}

/**
 * Reserved `initiator` markers that flag a system-driven session. Everything else is a
 * Directus user UUID and counts as manual. Centralised so the filter classifier and
 * `formatInitiator` / `useSyncLogUserNames` share one source of truth.
 */
const AUTOMATED_INITIATORS: ReadonlySet<string> = new Set(['hook', 'webhook']);

/**
 * Classify a session row's `initiator` column into the coarse "automated vs manual"
 * dimension the new filter exposes. Pure helper. Unknown markers (anything the future
 * may add that isn't a UUID) default to `'automated'` so a new system-driven event
 * type doesn't quietly mis-classify as user activity.
 */
export function classifyInitiator(initiator: string): InitiatorKind {
  if (AUTOMATED_INITIATORS.has(initiator)) return 'automated';
  // Heuristic: real Directus user ids are UUIDs (36 chars with dashes); a raw string
  // that isn't a UUID and isn't in the reserved set is most likely a future marker.
  const isLikelyUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(initiator);
  return isLikelyUuid ? 'manual' : 'automated';
}

/**
 * Free-string `event_type` → human-readable label. Mirrors the values the orchestrator
 * + webhook flow persist (`download-incremental`, `download-full`, `upload-incremental`,
 * `upload-full`, `upload-automated`, `webhook`). Unknown values pass through verbatim so
 * a future `event_type` doesn't disappear from the UI before we've taught the mapping.
 *
 * Note: user-facing copy says "export" per CONTEXT.md's resolved upload/export
 * ambiguity; the column values keep `upload-*` because the rename is column-coordinated
 * (out of scope here).
 *
 * Pure.
 */
export function formatEventType(eventType: string): string {
  switch (eventType) {
    case 'download-incremental':
      return 'Incremental download';
    case 'download-full':
      return 'Full download';
    case 'upload-incremental':
      return 'Incremental export';
    case 'upload-full':
      return 'Full export';
    case 'upload-automated':
      return 'Automated export';
    case 'webhook':
      return 'Webhook';
    default:
      return eventType;
  }
}

/**
 * `initiator` → human-readable label. Callers should populate `initiator` (the
 * orchestrator does so for every row it writes); an empty value falls through to the
 * generic "Triggered by user" label rather than crashing. Four input shapes:
 *
 * - The literal `'webhook'` → `"Triggered by webhook"`. Both the webhook handler's
 *   early-reject rows and the orchestrator's webhook-driven runs persist this value.
 * - The literal `'hook'` → `"Triggered automatically"`. The burst coordinator writes
 *   this for Automated export bursts; per-entry user attribution lives inside the
 *   entries blob, not at the session level.
 * - A Directus user id WITH a successful `lookupUserName` resolve → `"Triggered by <name>"`.
 *   Only the currently-logged-in user's name is reachable synchronously; other ids fall
 *   through to the generic label.
 * - A Directus user id WITHOUT a lookup (or one returning `null`) → `"Triggered by user"`.
 *
 * Pure — the optional name lookup is decoupled so the formatter stays synchronous and
 * testable.
 */
export function formatInitiator(initiator: string, lookupUserName?: (userId: string) => string | null): string {
  if (initiator === 'webhook') return 'Triggered by webhook';
  if (initiator === 'hook') return 'Triggered automatically';
  const resolved = lookupUserName?.(initiator);
  if (resolved) return `Triggered by ${resolved}`;
  return 'Triggered by user';
}

/**
 * Returns duration in milliseconds, or `null` if the session hasn't finished. Used by
 * both the table sort and the "Duration" column rendering.
 */
export function durationMs(session: SyncLogSession): number | null {
  if (!session.finished_at) return null;
  const startedMs = Date.parse(session.started_at);
  const finishedMs = Date.parse(session.finished_at);
  if (!Number.isFinite(startedMs) || !Number.isFinite(finishedMs)) return null;
  return finishedMs - startedMs;
}

/** Human-readable duration. Pure so the format is stable across locale changes. */
export function formatDuration(session: SyncLogSession): string {
  const diff = durationMs(session);
  if (diff === null) return '-';
  if (diff < 1000) return `${diff}ms`;
  if (diff < 60000) return `${Math.round(diff / 1000)}s`;
  const minutes = Math.floor(diff / 60000);
  const seconds = Math.round((diff % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/** Locale-aware date format used in both the table and the detail metadata block. */
export function formatStartedAt(session: SyncLogSession): string {
  const ms = Date.parse(session.started_at);
  if (!Number.isFinite(ms)) return session.started_at;
  return new Date(ms).toLocaleString();
}

/**
 * Pure: filters a session list by the current tab, status set, initiator-kind set,
 * and date range. Extracted so the filter behaviour is testable without mounting the
 * Vue component.
 *
 * `statuses` and `initiators` are OR sets — an empty (or omitted) array means
 * "no filter on this dimension, show all". Mirrors the multi-select interface in the
 * Activity page header.
 */
export function filterSessions(
  sessions: SyncLogSession[],
  opts: {
    tab: ActivityTab;
    statuses?: string[];
    initiators?: InitiatorKind[];
    dateFrom?: Date;
    dateTo?: Date;
  },
): SyncLogSession[] {
  const statusSet = opts.statuses && opts.statuses.length > 0 ? new Set(opts.statuses) : null;
  const initiatorSet = opts.initiators && opts.initiators.length > 0 ? new Set(opts.initiators) : null;
  return sessions.filter((session) => {
    if (tabForEventType(session.event_type) !== opts.tab) return false;
    if (statusSet && !statusSet.has(session.status)) return false;
    if (initiatorSet && !initiatorSet.has(classifyInitiator(session.initiator))) return false;

    const startedMs = Date.parse(session.started_at);
    // Cutoffs are interpreted as UTC midnight to match `session.started_at`'s UTC ISO
    // string. Mixing local-time `new Date(...)` with `Date.parse(...)` caused TZ-offset
    // bugs near midnight UTC for non-UTC users.
    if (opts.dateFrom) {
      const fromMs = Date.UTC(opts.dateFrom.getUTCFullYear(), opts.dateFrom.getUTCMonth(), opts.dateFrom.getUTCDate());
      if (Number.isFinite(startedMs) && startedMs < fromMs) return false;
    }
    if (opts.dateTo) {
      const toMs = Date.UTC(opts.dateTo.getUTCFullYear(), opts.dateTo.getUTCMonth(), opts.dateTo.getUTCDate(), 23, 59, 59, 999);
      if (Number.isFinite(startedMs) && startedMs > toMs) return false;
    }

    return true;
  });
}

/**
 * Pure: comparator builder used by `Array.prototype.sort`. Extracted for unit testing
 * — the same comparator drives the v-table sort and the export step.
 */
export function compareSessions(a: SyncLogSession, b: SyncLogSession, pref: SortPreference): number {
  let cmp = 0;
  switch (pref.key) {
    case 'status':
      cmp = a.status.localeCompare(b.status);
      break;
    case 'started_at':
      cmp = Date.parse(a.started_at) - Date.parse(b.started_at);
      break;
    case 'duration': {
      // Unfinished sessions sort as Infinity duration — they go to the end on asc, to
      // the front on desc. Avoids losing in-progress rows under any sort.
      const da = durationMs(a) ?? Number.POSITIVE_INFINITY;
      const db = durationMs(b) ?? Number.POSITIVE_INFINITY;
      cmp = da - db;
      break;
    }
    case 'initiator':
      cmp = a.initiator.localeCompare(b.initiator);
      break;
    case 'summary':
      cmp = a.summary.localeCompare(b.summary);
      break;
  }
  return pref.direction === 'asc' ? cmp : -cmp;
}

/** Pure: windowed pagination. Returns the rows for the current page (1-indexed). */
export function paginate<T>(rows: T[], page: number, pageSize = PAGE_SIZE): T[] {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  return rows.slice((safePage - 1) * pageSize, safePage * pageSize);
}

/** Pure: parse the JSON sort-preferences value stored on `localazy_settings`. */
export function parseSortPreferences(value: string): SortPreferences {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === 'object') {
      return parsed as SortPreferences;
    }
  } catch {
    /* fall through */
  }
  return {};
}

export function serializeSortPreferences(prefs: SortPreferences): string {
  return JSON.stringify(prefs);
}

/**
 * Composable that wraps the activity-log list lifecycle: tab, search, date range,
 * per-tab sort, pagination. Returns reactive accessors and the filtered/sorted/paged
 * rows for the current view.
 *
 * The pure logic above is reused so the same predicates that power the screen also
 * drive the export-logs action (which exports the currently-filtered set).
 */
export function useActivityLog(input: {
  sessions: Ref<SyncLogSession[]>;
  initialSortPreferences: Ref<SortPreferences>;
  onSortPreferencesChange: (prefs: SortPreferences) => void;
}) {
  const activeTab = ref<ActivityTab>('upload');
  const statusFilter = ref<string[]>([]);
  const initiatorFilter = ref<InitiatorKind[]>([]);
  // Default range mirrors Strapi: From = 30 days ago, To = today. UTC midnight on both
  // ends so the cutoffs line up with `filterSessions`' UTC-based comparison.
  const today = new Date();
  const defaultDateTo = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const defaultDateFrom = new Date(defaultDateTo.getTime() - 30 * 24 * 60 * 60 * 1000);
  const dateFrom = ref<Date | undefined>(defaultDateFrom);
  const dateTo = ref<Date | undefined>(defaultDateTo);
  const page = ref(1);
  const sortPreferences = ref<SortPreferences>({ ...input.initialSortPreferences.value });

  // Keep the local sort prefs in sync with the upstream-loaded settings (the watch
  // mirrors the singleton reload pattern — first time the settings come back, the
  // local copy reseats).
  watch(input.initialSortPreferences, (next) => {
    sortPreferences.value = { ...next };
  });

  // Whenever the filter inputs change, reset to page 1 — otherwise a 5-page result
  // suddenly collapsing to 1 page would leave the user on a non-existent page 4.
  watch([statusFilter, initiatorFilter, dateFrom, dateTo, activeTab], () => {
    page.value = 1;
  });

  const currentSort = computed<SortPreference>(() => sortPreferences.value[activeTab.value] ?? DEFAULT_SORT);

  function setSort(key: SortKey) {
    const current = currentSort.value;
    const direction: SortDirection = current.key === key && current.direction === 'asc' ? 'desc' : current.key === key ? 'asc' : 'asc';
    const next: SortPreferences = { ...sortPreferences.value, [activeTab.value]: { key, direction } };
    sortPreferences.value = next;
    input.onSortPreferencesChange(next);
    page.value = 1;
  }

  const filteredSessions = computed(() =>
    filterSessions(input.sessions.value, {
      tab: activeTab.value,
      statuses: statusFilter.value,
      initiators: initiatorFilter.value,
      dateFrom: dateFrom.value,
      dateTo: dateTo.value,
    }),
  );

  const sortedSessions = computed(() => [...filteredSessions.value].sort((a, b) => compareSessions(a, b, currentSort.value)));

  const totalPages = computed(() => Math.max(1, Math.ceil(sortedSessions.value.length / PAGE_SIZE)));
  const paginatedSessions = computed(() => paginate(sortedSessions.value, page.value, PAGE_SIZE));

  return {
    activeTab,
    statusFilter,
    initiatorFilter,
    dateFrom,
    dateTo,
    page,
    totalPages,
    sortPreferences,
    currentSort,
    setSort,
    filteredSessions,
    sortedSessions,
    paginatedSessions,
  };
}
