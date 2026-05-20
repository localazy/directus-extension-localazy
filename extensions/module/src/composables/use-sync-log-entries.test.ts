import { describe, it, expect } from 'vitest';
import { ref } from 'vue';
import type { SyncLogSession } from '../../../common/models/collections-data/sync-log';
import { formatSyncLogEntryTime, iconForSyncLogLevel, parseSyncLogEntries, useSyncLogEntries } from './use-sync-log-entries';

describe('parseSyncLogEntries', () => {
  it('returns [] for null, undefined, and empty string', () => {
    expect(parseSyncLogEntries(null)).toEqual([]);
    expect(parseSyncLogEntries(undefined)).toEqual([]);
    expect(parseSyncLogEntries('')).toEqual([]);
  });

  it('returns [] for malformed JSON', () => {
    expect(parseSyncLogEntries('not json')).toEqual([]);
    expect(parseSyncLogEntries('{')).toEqual([]);
  });

  it('returns [] when the parsed JSON is not an array', () => {
    expect(parseSyncLogEntries('{}')).toEqual([]);
    expect(parseSyncLogEntries('"a string"')).toEqual([]);
    expect(parseSyncLogEntries('42')).toEqual([]);
  });

  it('returns the parsed array when the JSON encodes a SyncLogEntry[]', () => {
    const json = JSON.stringify([
      { timestamp: '2026-05-17T10:00:00Z', level: 'info', message: 'first' },
      { timestamp: '2026-05-17T10:00:01Z', level: 'error', message: 'oops', data: { foo: 1 } },
    ]);

    expect(parseSyncLogEntries(json)).toEqual([
      { timestamp: '2026-05-17T10:00:00Z', level: 'info', message: 'first' },
      { timestamp: '2026-05-17T10:00:01Z', level: 'error', message: 'oops', data: { foo: 1 } },
    ]);
  });
});

describe('formatSyncLogEntryTime', () => {
  it('returns the input verbatim when it cannot be parsed as a date', () => {
    expect(formatSyncLogEntryTime('not a date')).toBe('not a date');
    expect(formatSyncLogEntryTime('')).toBe('');
  });

  it('formats a parseable ISO timestamp as a time-of-day string', () => {
    // Locale + timezone are environment-dependent, so we don't pin the exact output
    // string. Just assert: not the raw input, no "Invalid Date", and contains digits.
    const formatted = formatSyncLogEntryTime('2026-05-17T14:23:07Z');

    expect(formatted).not.toBe('2026-05-17T14:23:07Z');
    expect(formatted).not.toContain('Invalid');
    expect(formatted).toMatch(/\d/);
  });
});

describe('iconForSyncLogLevel', () => {
  it('maps each known level to the Directus icon name used in the detail page', () => {
    expect(iconForSyncLogLevel('error')).toBe('error_outline');
    expect(iconForSyncLogLevel('warn')).toBe('warning_amber');
    expect(iconForSyncLogLevel('info')).toBe('info');
  });
});

describe('useSyncLogEntries', () => {
  function makeSession(entriesJson: string | null): SyncLogSession {
    return { entries: entriesJson } as unknown as SyncLogSession;
  }

  it('reactively reflects the current session row entries', () => {
    const session = ref<SyncLogSession | null>(null);
    const { entries } = useSyncLogEntries(session);

    expect(entries.value).toEqual([]);

    session.value = makeSession(JSON.stringify([{ timestamp: 't1', level: 'info', message: 'hello' }]));
    expect(entries.value).toEqual([{ timestamp: 't1', level: 'info', message: 'hello' }]);
  });

  it('returns the same formatTime + iconForLevel references as the named module exports', () => {
    const session = ref<SyncLogSession | null>(null);
    const view = useSyncLogEntries(session);

    expect(view.formatTime).toBe(formatSyncLogEntryTime);
    expect(view.iconForLevel).toBe(iconForSyncLogLevel);
  });
});
