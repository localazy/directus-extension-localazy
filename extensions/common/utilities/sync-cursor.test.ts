import { describe, it, expect } from 'vitest';
import type { Key } from '@localazy/api-client';
import {
  createEmptyCursor,
  parseCursor,
  serializeCursor,
  cursorMatchesProject,
  filterKeysByEventCursor,
  recordCursorEntry,
  mergeCursor,
  countCursorEntries,
} from './sync-cursor';

const makeKey = (id: string, event?: number): Key =>
  ({
    id,
    key: ['some', 'key'],
    value: 'val',
    ...(event !== undefined ? { event } : {}),
  }) as Key;

describe('createEmptyCursor', () => {
  it('returns a cursor with an empty processed_keys map', () => {
    expect(createEmptyCursor()).toEqual({ processed_keys: {} });
  });
});

describe('parseCursor', () => {
  it('returns empty cursor for null / undefined / empty string', () => {
    expect(parseCursor(null)).toEqual({ processed_keys: {} });
    expect(parseCursor(undefined)).toEqual({ processed_keys: {} });
    expect(parseCursor('')).toEqual({ processed_keys: {} });
  });

  it('parses a well-formed JSON map', () => {
    const raw = JSON.stringify({ en: { k1: 10, k2: 20 }, fr: { k1: 5 } });
    expect(parseCursor(raw)).toEqual({ processed_keys: { en: { k1: 10, k2: 20 }, fr: { k1: 5 } } });
  });

  it('returns empty cursor for malformed JSON', () => {
    expect(parseCursor('{not-json')).toEqual({ processed_keys: {} });
  });

  it('returns empty cursor for non-object JSON (array / string / number)', () => {
    expect(parseCursor('[1,2,3]')).toEqual({ processed_keys: {} });
    expect(parseCursor('"hello"')).toEqual({ processed_keys: {} });
    expect(parseCursor('42')).toEqual({ processed_keys: {} });
  });

  it('drops non-numeric event values silently', () => {
    const raw = JSON.stringify({ en: { k1: 10, k2: 'oops', k3: null, k4: 7 } });
    expect(parseCursor(raw)).toEqual({ processed_keys: { en: { k1: 10, k4: 7 } } });
  });

  it('drops non-object per-language buckets', () => {
    const raw = JSON.stringify({ en: { k1: 10 }, fr: 'broken', de: null });
    expect(parseCursor(raw)).toEqual({ processed_keys: { en: { k1: 10 } } });
  });

  it('drops Infinity / NaN as non-finite numbers', () => {
    // JSON.stringify would normally turn these to null, so build the object manually.
    const raw = '{"en":{"k1":10,"k2":null}}';
    expect(parseCursor(raw)).toEqual({ processed_keys: { en: { k1: 10 } } });
  });
});

describe('serializeCursor', () => {
  it('serializes the processed_keys map to JSON', () => {
    expect(serializeCursor({ processed_keys: { en: { k1: 10 } } })).toBe('{"en":{"k1":10}}');
  });

  it('serializes empty cursor to empty object string', () => {
    expect(serializeCursor(createEmptyCursor())).toBe('{}');
  });

  it('round-trips through parseCursor', () => {
    const original = { processed_keys: { en: { k1: 10, k2: 20 }, fr: { k3: 5 } } };
    expect(parseCursor(serializeCursor(original))).toEqual(original);
  });
});

describe('cursorMatchesProject', () => {
  it('returns true when stored project id is empty (first sync)', () => {
    expect(cursorMatchesProject('', 'abc')).toBe(true);
  });

  it('returns true when stored matches current', () => {
    expect(cursorMatchesProject('abc', 'abc')).toBe(true);
  });

  it('returns false when stored differs from current', () => {
    expect(cursorMatchesProject('abc', 'def')).toBe(false);
  });
});

describe('filterKeysByEventCursor', () => {
  it('returns all keys when the cursor is undefined (no prior sync for this language)', () => {
    const keys = [makeKey('k1', 10), makeKey('k2', 20)];
    expect(filterKeysByEventCursor(keys, undefined)).toEqual(keys);
  });

  it('returns all keys when the per-language cursor is empty', () => {
    const keys = [makeKey('k1', 10), makeKey('k2', 20)];
    expect(filterKeysByEventCursor(keys, {})).toEqual(keys);
  });

  it('skips keys whose event equals the stored event', () => {
    const k1 = makeKey('k1', 10);
    const k2 = makeKey('k2', 20);
    expect(filterKeysByEventCursor([k1, k2], { k1: 10, k2: 15 })).toEqual([k2]);
  });

  it('skips keys whose event is less than the stored event', () => {
    const k1 = makeKey('k1', 5);
    expect(filterKeysByEventCursor([k1], { k1: 10 })).toEqual([]);
  });

  it('includes keys whose event is greater than the stored event', () => {
    const k1 = makeKey('k1', 11);
    expect(filterKeysByEventCursor([k1], { k1: 10 })).toEqual([k1]);
  });

  it('includes keys with undefined event (safe mode for server without event support)', () => {
    const k1 = makeKey('k1');
    expect(filterKeysByEventCursor([k1], { k1: 999 })).toEqual([k1]);
  });

  it('includes keys not present in the cursor (first time we see them)', () => {
    const k1 = makeKey('k1', 10);
    const k2 = makeKey('k2', 20);
    expect(filterKeysByEventCursor([k1, k2], { k1: 10 })).toEqual([k2]);
  });
});

describe('recordCursorEntry', () => {
  it('creates a new per-language bucket if one does not exist', () => {
    const cursor = createEmptyCursor();
    recordCursorEntry(cursor, 'en', 'k1', 10);
    expect(cursor.processed_keys).toEqual({ en: { k1: 10 } });
  });

  it('records into an existing bucket without disturbing other cells', () => {
    const cursor = { processed_keys: { en: { k1: 5 } } };
    recordCursorEntry(cursor, 'en', 'k2', 7);
    expect(cursor.processed_keys).toEqual({ en: { k1: 5, k2: 7 } });
  });

  it('keeps the higher event when an entry already exists', () => {
    const cursor = { processed_keys: { en: { k1: 10 } } };
    recordCursorEntry(cursor, 'en', 'k1', 5);
    expect(cursor.processed_keys.en).toEqual({ k1: 10 });
  });

  it('upgrades the entry when called with a higher event', () => {
    const cursor = { processed_keys: { en: { k1: 10 } } };
    recordCursorEntry(cursor, 'en', 'k1', 20);
    expect(cursor.processed_keys.en).toEqual({ k1: 20 });
  });

  it('is a no-op when event is undefined', () => {
    const cursor = { processed_keys: { en: { k1: 10 } } };
    recordCursorEntry(cursor, 'en', 'k1', undefined);
    expect(cursor.processed_keys.en).toEqual({ k1: 10 });
  });

  it('does not create a language bucket when event is undefined', () => {
    const cursor = createEmptyCursor();
    recordCursorEntry(cursor, 'fr', 'k1', undefined);
    expect(cursor.processed_keys).toEqual({});
  });
});

describe('mergeCursor', () => {
  it('returns identity-equivalent of either cursor when the other is empty', () => {
    const a = { processed_keys: { en: { k1: 10 } } };
    const empty = createEmptyCursor();
    expect(mergeCursor(a, empty)).toEqual(a);
    expect(mergeCursor(empty, a)).toEqual(a);
  });

  it('combines disjoint languages', () => {
    const a = { processed_keys: { en: { k1: 10 } } };
    const b = { processed_keys: { fr: { k2: 20 } } };
    expect(mergeCursor(a, b)).toEqual({ processed_keys: { en: { k1: 10 }, fr: { k2: 20 } } });
  });

  it('combines disjoint keys within the same language', () => {
    const a = { processed_keys: { en: { k1: 10 } } };
    const b = { processed_keys: { en: { k2: 20 } } };
    expect(mergeCursor(a, b)).toEqual({ processed_keys: { en: { k1: 10, k2: 20 } } });
  });

  it('takes max for overlapping cells', () => {
    const a = { processed_keys: { en: { k1: 10, k2: 30 } } };
    const b = { processed_keys: { en: { k1: 20, k2: 25 } } };
    expect(mergeCursor(a, b)).toEqual({ processed_keys: { en: { k1: 20, k2: 30 } } });
  });

  it('does not mutate the inputs', () => {
    const a = { processed_keys: { en: { k1: 10 } } };
    const b = { processed_keys: { en: { k1: 20 } } };
    mergeCursor(a, b);
    expect(a).toEqual({ processed_keys: { en: { k1: 10 } } });
    expect(b).toEqual({ processed_keys: { en: { k1: 20 } } });
  });
});

describe('countCursorEntries', () => {
  it('returns 0 for empty cursor', () => {
    expect(countCursorEntries(createEmptyCursor())).toBe(0);
  });

  it('sums per-language map sizes', () => {
    const cursor = { processed_keys: { en: { k1: 1, k2: 2 }, fr: { k3: 3 } } };
    expect(countCursorEntries(cursor)).toBe(3);
  });
});
