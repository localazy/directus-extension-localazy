import { describe, expect, it } from 'vitest';
import {
  classifyInitiator,
  compareSessions,
  filterSessions,
  formatDuration,
  formatEventType,
  formatInitiator,
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
  it('routes upload-* to upload (Export tab)', () => {
    expect(tabForEventType('upload-incremental')).toBe('upload');
    expect(tabForEventType('upload-full')).toBe('upload');
    expect(tabForEventType('upload-automated')).toBe('upload');
  });

  it('routes download-* to download (Import tab)', () => {
    expect(tabForEventType('download-incremental')).toBe('download');
    expect(tabForEventType('download-full')).toBe('download');
  });

  // `'webhook'` is inbound Localazy → Directus and semantically a download; routing
  // it to the Import tab is the simplification PR 67 introduces. The Initiator filter
  // is where users distinguish webhook-driven runs from UI-driven ones.
  it('routes webhook to download (Import tab)', () => {
    expect(tabForEventType('webhook')).toBe('download');
  });

  it('routes unknown event types to download as the safe fallback', () => {
    expect(tabForEventType('manual-override')).toBe('download');
    expect(tabForEventType('some-future-event')).toBe('download');
  });
});

describe('classifyInitiator', () => {
  it("classifies the reserved 'hook' and 'webhook' markers as automated", () => {
    expect(classifyInitiator('hook')).toBe('automated');
    expect(classifyInitiator('webhook')).toBe('automated');
  });

  it('classifies a Directus user UUID as manual', () => {
    expect(classifyInitiator('c1edb242-a6d8-43ff-82c9-b5eebc39595a')).toBe('manual');
  });

  it('classifies a non-UUID, non-reserved string as automated (defensive default)', () => {
    // Future markers — anything system-driven that hasn't been added to the reserved
    // set yet — default to automated rather than misclassifying as user activity.
    expect(classifyInitiator('scheduled')).toBe('automated');
    expect(classifyInitiator('')).toBe('automated');
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
  // Initiator column in production carries either a Directus user UUID (manual runs)
  // or one of the reserved markers `'webhook'` / `'hook'` (automated runs). The fixture
  // mirrors that so the new Initiator filter classifies rows as it would in real data.
  const ALICE = '00000000-0000-4000-8000-000000000001';
  const BOB = '00000000-0000-4000-8000-000000000002';
  const sessions: SyncLogSession[] = [
    make({ id: '1', event_type: 'upload-incremental', initiator: ALICE, status: 'completed' }),
    make({ id: '2', event_type: 'upload-full', initiator: BOB, status: 'failed' }),
    make({ id: '3', event_type: 'upload-automated', initiator: 'hook', status: 'completed' }),
    make({ id: '4', event_type: 'download-incremental', initiator: ALICE, status: 'skipped' }),
    make({ id: '5', event_type: 'webhook', initiator: 'webhook', status: 'completed' }),
  ];

  it('filters by tab — webhook event_type lands in download (Import) now', () => {
    expect(filterSessions(sessions, { tab: 'upload' }).map((s) => s.id)).toEqual(['1', '2', '3']);
    expect(filterSessions(sessions, { tab: 'download' }).map((s) => s.id)).toEqual(['4', '5']);
  });

  it('treats an empty / missing `statuses` set as "show all"', () => {
    expect(filterSessions(sessions, { tab: 'upload', statuses: [] }).map((s) => s.id)).toEqual(['1', '2', '3']);
    expect(filterSessions(sessions, { tab: 'upload' }).map((s) => s.id)).toEqual(['1', '2', '3']);
  });

  it('filters by `statuses` as an OR set', () => {
    expect(filterSessions(sessions, { tab: 'upload', statuses: ['completed'] }).map((s) => s.id)).toEqual(['1', '3']);
    expect(filterSessions(sessions, { tab: 'upload', statuses: ['completed', 'failed'] }).map((s) => s.id)).toEqual(['1', '2', '3']);
    // A status that no upload row carries returns nothing within the tab.
    expect(filterSessions(sessions, { tab: 'upload', statuses: ['skipped'] }).map((s) => s.id)).toEqual([]);
  });

  it('filters by `initiators` — manual surfaces only user-UUID rows', () => {
    expect(filterSessions(sessions, { tab: 'upload', initiators: ['manual'] }).map((s) => s.id)).toEqual(['1', '2']);
    expect(filterSessions(sessions, { tab: 'download', initiators: ['manual'] }).map((s) => s.id)).toEqual(['4']);
  });

  it("filters by `initiators` — automated surfaces 'hook' and 'webhook' rows", () => {
    expect(filterSessions(sessions, { tab: 'upload', initiators: ['automated'] }).map((s) => s.id)).toEqual(['3']);
    expect(filterSessions(sessions, { tab: 'download', initiators: ['automated'] }).map((s) => s.id)).toEqual(['5']);
  });

  it('treats an empty / missing `initiators` set as "show all"', () => {
    expect(filterSessions(sessions, { tab: 'upload', initiators: [] }).map((s) => s.id)).toEqual(['1', '2', '3']);
    expect(filterSessions(sessions, { tab: 'upload' }).map((s) => s.id)).toEqual(['1', '2', '3']);
  });

  it('combines status + initiator as AND', () => {
    // Only upload rows that are BOTH completed AND manual.
    expect(filterSessions(sessions, { tab: 'upload', statuses: ['completed'], initiators: ['manual'] }).map((s) => s.id)).toEqual(['1']);
  });

  it('filters by dateFrom / dateTo', () => {
    const mixed: SyncLogSession[] = [
      make({ id: 'old', event_type: 'upload-incremental', started_at: '2026-04-01T00:00:00Z' }),
      make({ id: 'mid', event_type: 'upload-incremental', started_at: '2026-05-01T00:00:00Z' }),
      make({ id: 'new', event_type: 'upload-incremental', started_at: '2026-06-01T00:00:00Z' }),
    ];
    const result = filterSessions(mixed, {
      tab: 'upload',
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

describe('formatEventType', () => {
  it('maps each known event type to a human-readable label', () => {
    expect(formatEventType('download-incremental')).toBe('Incremental download');
    expect(formatEventType('download-full')).toBe('Full download');
    // user-facing copy says "export" per CONTEXT.md's resolved upload/export ambiguity;
    // the persisted column keeps `upload-*` to avoid a coordinated migration.
    expect(formatEventType('upload-incremental')).toBe('Incremental export');
    expect(formatEventType('upload-full')).toBe('Full export');
    expect(formatEventType('upload-automated')).toBe('Automated export');
    expect(formatEventType('webhook')).toBe('Webhook');
  });

  it('passes unknown values through verbatim so future event types remain visible', () => {
    expect(formatEventType('some-future-event')).toBe('some-future-event');
  });
});

describe('formatInitiator', () => {
  it('returns the webhook label for the literal "webhook" initiator', () => {
    expect(formatInitiator('webhook')).toBe('Triggered by webhook');
  });

  it('returns the automated label for the literal "hook" initiator (burst sessions)', () => {
    expect(formatInitiator('hook')).toBe('Triggered automatically');
  });

  it('returns the resolved user name when the lookup succeeds', () => {
    const lookup = (id: string) => (id === 'user-1' ? 'Alice' : null);
    expect(formatInitiator('user-1', lookup)).toBe('Triggered by Alice');
  });

  it('falls back to a generic label when the lookup returns null', () => {
    const lookup = () => null;
    expect(formatInitiator('user-1', lookup)).toBe('Triggered by user');
  });

  it('falls back to a generic label when no lookup is supplied for a non-webhook initiator', () => {
    expect(formatInitiator('user-1')).toBe('Triggered by user');
  });
});
