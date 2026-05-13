import { describe, expect, it } from 'vitest';
import {
  compareSessions,
  filterSessions,
  formatDuration,
  paginate,
  parseSortPreferences,
  PAGE_SIZE,
  serializeSortPreferences,
  tabForEventType,
  type SortPreference,
} from './use-activity-log';
import type { SyncLogSession } from '../../../common/models/collections-data/sync-log';

const baseSession: SyncLogSession = {
  id: 'x',
  event_type: 'download-incremental',
  status: 'completed',
  started_at: '2026-05-12T10:00:00Z',
  finished_at: '2026-05-12T10:00:05Z',
  initiator: 'alice',
  initiator_user: null,
  summary: 'Imported 5 keys',
  items_processed: 5,
  entries: '[]',
};

const make = (overrides: Partial<SyncLogSession>): SyncLogSession => ({ ...baseSession, ...overrides });

describe('tabForEventType', () => {
  it('routes upload-* to upload', () => {
    expect(tabForEventType('upload-incremental')).toBe('upload');
    expect(tabForEventType('upload-full')).toBe('upload');
  });

  it('routes download-* to download', () => {
    expect(tabForEventType('download-incremental')).toBe('download');
    expect(tabForEventType('download-full')).toBe('download');
  });

  it('routes webhook and unknown values to webhook', () => {
    expect(tabForEventType('webhook')).toBe('webhook');
    expect(tabForEventType('manual-override')).toBe('webhook');
  });
});

describe('formatDuration', () => {
  it('returns "-" for unfinished sessions', () => {
    expect(formatDuration(make({ finished_at: null }))).toBe('-');
  });

  it('returns ms for sub-second durations', () => {
    expect(formatDuration(make({ started_at: '2026-05-12T10:00:00Z', finished_at: '2026-05-12T10:00:00.500Z' }))).toBe('500ms');
  });

  it('returns Ns for durations under a minute', () => {
    expect(formatDuration(make({ started_at: '2026-05-12T10:00:00Z', finished_at: '2026-05-12T10:00:42Z' }))).toBe('42s');
  });

  it('returns Nm Ns for durations over a minute', () => {
    expect(formatDuration(make({ started_at: '2026-05-12T10:00:00Z', finished_at: '2026-05-12T10:02:30Z' }))).toBe('2m 30s');
  });
});

describe('filterSessions', () => {
  const sessions: SyncLogSession[] = [
    make({ id: '1', event_type: 'upload-incremental', initiator: 'alice' }),
    make({ id: '2', event_type: 'upload-full', initiator: 'bob' }),
    make({ id: '3', event_type: 'download-incremental', initiator: 'alice' }),
    make({ id: '4', event_type: 'webhook', initiator: 'webhook' }),
  ];

  it('filters by tab', () => {
    expect(filterSessions(sessions, { tab: 'upload', searchQuery: '' }).map((s) => s.id)).toEqual(['1', '2']);
    expect(filterSessions(sessions, { tab: 'download', searchQuery: '' }).map((s) => s.id)).toEqual(['3']);
    expect(filterSessions(sessions, { tab: 'webhook', searchQuery: '' }).map((s) => s.id)).toEqual(['4']);
  });

  it('filters by search query against summary, initiator, status, and date', () => {
    const result = filterSessions(sessions, { tab: 'upload', searchQuery: 'bob' });
    expect(result.map((s) => s.id)).toEqual(['2']);
  });

  it('filters by dateFrom / dateTo', () => {
    const mixed: SyncLogSession[] = [
      make({ id: 'old', event_type: 'upload-incremental', started_at: '2026-04-01T00:00:00Z' }),
      make({ id: 'mid', event_type: 'upload-incremental', started_at: '2026-05-01T00:00:00Z' }),
      make({ id: 'new', event_type: 'upload-incremental', started_at: '2026-06-01T00:00:00Z' }),
    ];
    const result = filterSessions(mixed, {
      tab: 'upload',
      searchQuery: '',
      dateFrom: new Date(Date.UTC(2026, 4, 1)),
      dateTo: new Date(Date.UTC(2026, 4, 31)),
    });
    expect(result.map((s) => s.id)).toEqual(['mid']);
  });
});

describe('compareSessions', () => {
  const a = make({
    id: 'a',
    status: 'completed',
    started_at: '2026-05-12T10:00:00Z',
    finished_at: '2026-05-12T10:00:01Z',
    initiator: 'alice',
    summary: 'A',
  });
  const b = make({
    id: 'b',
    status: 'failed',
    started_at: '2026-05-12T11:00:00Z',
    finished_at: '2026-05-12T11:00:05Z',
    initiator: 'bob',
    summary: 'B',
  });

  it('sorts by started_at desc by default', () => {
    const pref: SortPreference = { key: 'started_at', direction: 'desc' };
    expect(compareSessions(a, b, pref)).toBeGreaterThan(0); // b (newer) before a
  });

  it('sorts by duration ascending — shorter first', () => {
    const pref: SortPreference = { key: 'duration', direction: 'asc' };
    expect(compareSessions(a, b, pref)).toBeLessThan(0); // a (1s) before b (5s)
  });

  it('treats unfinished sessions as Infinity duration', () => {
    const inProgress = make({ id: 'p', status: 'in_progress', started_at: '2026-05-12T10:00:00Z', finished_at: null });
    const pref: SortPreference = { key: 'duration', direction: 'asc' };
    expect(compareSessions(inProgress, a, pref)).toBeGreaterThan(0); // a before inProgress
  });

  it('sorts by initiator alphabetically', () => {
    const pref: SortPreference = { key: 'initiator', direction: 'asc' };
    expect(compareSessions(a, b, pref)).toBeLessThan(0);
  });

  it('honors descending direction', () => {
    const pref: SortPreference = { key: 'initiator', direction: 'desc' };
    expect(compareSessions(a, b, pref)).toBeGreaterThan(0);
  });
});

describe('paginate', () => {
  const rows = Array.from({ length: 45 }, (_, i) => `row-${i}`);

  it('returns the first page by default size', () => {
    const out = paginate(rows, 1);
    expect(out).toHaveLength(PAGE_SIZE);
    expect(out[0]).toBe('row-0');
  });

  it('clamps page to total pages', () => {
    const out = paginate(rows, 999);
    expect(out[out.length - 1]).toBe('row-44');
  });

  it('clamps page to at least 1', () => {
    const out = paginate(rows, 0);
    expect(out[0]).toBe('row-0');
  });

  it('returns the partial last page', () => {
    const out = paginate(rows, 3, 20);
    expect(out).toHaveLength(5);
    expect(out[0]).toBe('row-40');
  });
});

describe('parseSortPreferences / serializeSortPreferences', () => {
  it('round-trips an object', () => {
    const prefs = { upload: { key: 'duration', direction: 'asc' } as const };
    const json = serializeSortPreferences(prefs);
    expect(parseSortPreferences(json)).toEqual(prefs);
  });

  it('treats empty / invalid input as {}', () => {
    expect(parseSortPreferences('')).toEqual({});
    expect(parseSortPreferences('not json')).toEqual({});
    expect(parseSortPreferences('null')).toEqual({});
  });
});
