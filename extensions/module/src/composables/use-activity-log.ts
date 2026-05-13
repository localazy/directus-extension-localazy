import { computed, ref, watch, type Ref } from 'vue';
import type { SyncLogSession } from '../../../common/models/collections-data/sync-log';

/** Tabs surfaced on the Activity page. Mirrors Strapi's three-tab grouping. */
export type ActivityTab = 'upload' | 'download' | 'webhook';

export type SortKey = 'status' | 'started_at' | 'duration' | 'initiator' | 'summary';
export type SortDirection = 'asc' | 'desc';

export type SortPreference = { key: SortKey; direction: SortDirection };

export type SortPreferences = Partial<Record<ActivityTab, SortPreference>>;

export const PAGE_SIZE = 20;

const DEFAULT_SORT: SortPreference = { key: 'started_at', direction: 'desc' };

/**
 * Maps a `localazy_sync_log.event_type` value to the Activity tab it belongs to.
 * The mapping is intentionally permissive — anything starting with `upload-` lands in
 * Upload, `download-` in Download, the literal `webhook` in Webhooks, and every
 * unknown value is bucketed into Webhooks too (defensive — future event types
 * shouldn't disappear from the UI just because we haven't taught the mapping yet).
 *
 * Pure helper so the tab-routing logic stays testable.
 */
export function tabForEventType(eventType: string): ActivityTab {
  if (eventType.startsWith('upload')) return 'upload';
  if (eventType.startsWith('download')) return 'download';
  return 'webhook';
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
 * Pure: filters a session list by the current tab, search query, and date range.
 * Extracted so the filter behaviour is testable without mounting the Vue component.
 */
export function filterSessions(
  sessions: SyncLogSession[],
  opts: {
    tab: ActivityTab;
    searchQuery: string;
    dateFrom?: Date;
    dateTo?: Date;
  },
): SyncLogSession[] {
  const lcQuery = opts.searchQuery.trim().toLowerCase();
  return sessions.filter((session) => {
    if (tabForEventType(session.event_type) !== opts.tab) return false;

    const startedMs = Date.parse(session.started_at);
    if (opts.dateFrom) {
      const fromMs = new Date(opts.dateFrom.getUTCFullYear(), opts.dateFrom.getUTCMonth(), opts.dateFrom.getUTCDate()).getTime();
      if (Number.isFinite(startedMs) && startedMs < fromMs) return false;
    }
    if (opts.dateTo) {
      const toMs = new Date(opts.dateTo.getUTCFullYear(), opts.dateTo.getUTCMonth(), opts.dateTo.getUTCDate(), 23, 59, 59, 999).getTime();
      if (Number.isFinite(startedMs) && startedMs > toMs) return false;
    }

    if (!lcQuery) return true;
    const haystacks = [session.summary, session.initiator, session.status, formatStartedAt(session)];
    return haystacks.some((h) => h.toLowerCase().includes(lcQuery));
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
  const searchInput = ref('');
  const searchQuery = ref('');
  const dateFrom = ref<Date | undefined>(undefined);
  const dateTo = ref<Date | undefined>(undefined);
  const page = ref(1);
  const sortPreferences = ref<SortPreferences>({ ...input.initialSortPreferences.value });

  // Keep the local sort prefs in sync with the upstream-loaded settings (the watch
  // mirrors the singleton reload pattern — first time the settings come back, the
  // local copy reseats).
  watch(input.initialSortPreferences, (next) => {
    sortPreferences.value = { ...next };
  });

  // Debounced search input → query. 300ms matches Strapi.
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  function setSearch(value: string) {
    searchInput.value = value;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      searchQuery.value = value;
    }, 300);
  }

  // Whenever the filter inputs change, reset to page 1 — otherwise a 5-page result
  // suddenly collapsing to 1 page would leave the user on a non-existent page 4.
  watch([searchQuery, dateFrom, dateTo, activeTab], () => {
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
      searchQuery: searchQuery.value,
      dateFrom: dateFrom.value,
      dateTo: dateTo.value,
    }),
  );

  const sortedSessions = computed(() => [...filteredSessions.value].sort((a, b) => compareSessions(a, b, currentSort.value)));

  const totalPages = computed(() => Math.max(1, Math.ceil(sortedSessions.value.length / PAGE_SIZE)));
  const paginatedSessions = computed(() => paginate(sortedSessions.value, page.value, PAGE_SIZE));

  return {
    activeTab,
    searchInput,
    searchQuery,
    setSearch,
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
