import { describe, it, expect } from 'vitest';
import { appendEntryToJson, idsToTrim } from './sync-log-writer-helpers';
import { SYNC_LOG_RETENTION } from '../../../common/models/collections-data/sync-log';

describe('appendEntryToJson', () => {
  it('appends a new entry to an existing array', () => {
    const before = JSON.stringify([{ timestamp: 't1', level: 'info', message: 'first' }]);
    const result = appendEntryToJson(before, { timestamp: 't2', level: 'info', message: 'second' });
    const parsed = JSON.parse(result);
    expect(parsed).toHaveLength(2);
    expect(parsed[1]).toEqual({ timestamp: 't2', level: 'info', message: 'second' });
  });

  it('treats an empty string as an empty array', () => {
    const result = appendEntryToJson('', { timestamp: 't1', level: 'warn', message: 'hi' });
    expect(JSON.parse(result)).toEqual([{ timestamp: 't1', level: 'warn', message: 'hi' }]);
  });

  it('treats malformed JSON as an empty array (corruption recovery)', () => {
    const result = appendEntryToJson('not-json{', { timestamp: 't1', level: 'error', message: 'oops' });
    expect(JSON.parse(result)).toEqual([{ timestamp: 't1', level: 'error', message: 'oops' }]);
  });

  it('treats non-array JSON as an empty array', () => {
    const result = appendEntryToJson('{"foo":"bar"}', { timestamp: 't1', level: 'info', message: 'hi' });
    expect(JSON.parse(result)).toEqual([{ timestamp: 't1', level: 'info', message: 'hi' }]);
  });
});

describe('idsToTrim', () => {
  it('returns [] when total ids ≤ retention', () => {
    const ids = Array.from({ length: SYNC_LOG_RETENTION }, (_, i) => `id-${i}`);
    expect(idsToTrim(ids)).toEqual([]);
  });

  it('returns ids past the retention window when total exceeds retention', () => {
    const ids = Array.from({ length: SYNC_LOG_RETENTION + 3 }, (_, i) => `id-${i}`);
    const trimmed = idsToTrim(ids);
    expect(trimmed).toHaveLength(3);
    expect(trimmed).toEqual([`id-${SYNC_LOG_RETENTION}`, `id-${SYNC_LOG_RETENTION + 1}`, `id-${SYNC_LOG_RETENTION + 2}`]);
  });

  it('returns [] for an empty list', () => {
    expect(idsToTrim([])).toEqual([]);
  });
});
