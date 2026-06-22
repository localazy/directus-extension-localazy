import { describe, it, expect } from 'vitest';
import type { Key } from '@localazy/api-client';
import {
  createEmptyCursor,
  parseCursor,
  serializeCursor,
  cursorMatchesProject,
  filterKeysByEventCursor,
  advanceWatermark,
  buildWatermarkCursor,
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
  it('returns an empty cursor for null/undefined/empty input', () => {
    expect(parseCursor(null)).toEqual({ processed_keys: {} });
    expect(parseCursor(undefined)).toEqual({ processed_keys: {} });
    expect(parseCursor('')).toEqual({ processed_keys: {} });
  });

  it('parses a per-language watermark map', () => {
    expect(parseCursor('{"en":10,"fr":5}')).toEqual({ processed_keys: { en: 10, fr: 5 } });
  });

  it('parses negative watermarks (Localazy events are large negatives)', () => {
    expect(parseCursor('{"ar":-6481606696963903000}')).toEqual({ processed_keys: { ar: -6481606696963903000 } });
  });

  it('returns empty on malformed JSON', () => {
    expect(parseCursor('{not-json')).toEqual({ processed_keys: {} });
  });

  it('returns empty for non-object JSON', () => {
    expect(parseCursor('[1,2,3]')).toEqual({ processed_keys: {} });
    expect(parseCursor('"hello"')).toEqual({ processed_keys: {} });
    expect(parseCursor('42')).toEqual({ processed_keys: {} });
  });

  it('drops non-number values, keeping only valid numeric watermarks', () => {
    expect(parseCursor('{"en":10,"fr":"oops","de":null}')).toEqual({ processed_keys: { en: 10 } });
  });

  it('forward-migrates a legacy per-key map by dropping it (language re-syncs)', () => {
    // Old shape: { lang: { keyId: event } }. The object value is not a number, so the
    // language is dropped and will be re-synced once into a compact watermark.
    expect(parseCursor('{"en":{"k1":10,"k2":20},"fr":7}')).toEqual({ processed_keys: { fr: 7 } });
  });
});

describe('serializeCursor', () => {
  it('serializes the watermark map to JSON', () => {
    expect(serializeCursor({ processed_keys: { en: 10, fr: 5 } })).toBe('{"en":10,"fr":5}');
  });

  it('serializes an empty cursor to {}', () => {
    expect(serializeCursor(createEmptyCursor())).toBe('{}');
  });

  it('round-trips through parseCursor', () => {
    const original = { processed_keys: { en: 20, fr: 5 } };
    expect(parseCursor(serializeCursor(original))).toEqual(original);
  });
});

describe('cursorMatchesProject', () => {
  it('treats an empty stored project id as a match (first sync)', () => {
    expect(cursorMatchesProject('', 'proj-1')).toBe(true);
  });
  it('matches identical ids and rejects different ones', () => {
    expect(cursorMatchesProject('proj-1', 'proj-1')).toBe(true);
    expect(cursorMatchesProject('proj-1', 'proj-2')).toBe(false);
  });
});

describe('filterKeysByEventCursor', () => {
  it('includes all keys when there is no watermark for the language', () => {
    const keys = [makeKey('k1', 10), makeKey('k2', 20)];
    expect(filterKeysByEventCursor(keys, undefined)).toEqual(keys);
  });

  it('includes only keys with event greater than the watermark', () => {
    const k1 = makeKey('k1', 10);
    const k2 = makeKey('k2', 20);
    expect(filterKeysByEventCursor([k1, k2], 15)).toEqual([k2]);
  });

  it('excludes a key whose event equals the watermark', () => {
    const k1 = makeKey('k1', 10);
    expect(filterKeysByEventCursor([k1], 10)).toEqual([]);
  });

  it('includes a key with no event (safe mode), even below the watermark', () => {
    const k1 = makeKey('k1'); // no event
    expect(filterKeysByEventCursor([k1], 999)).toEqual([k1]);
  });

  it('works with negative event/watermark values', () => {
    const older = makeKey('o', -6481606864199203000);
    const newer = makeKey('n', -6481606696963903000);
    expect(filterKeysByEventCursor([older, newer], -6481606800000000000)).toEqual([newer]);
  });
});

describe('advanceWatermark', () => {
  it('advances to the max succeeded event when nothing failed', () => {
    expect(advanceWatermark(undefined, [10, 30, 20], [])).toBe(30);
    expect(advanceWatermark(5, [10, 30, 20], [])).toBe(30);
  });

  it('never moves backwards below the prior watermark', () => {
    expect(advanceWatermark(100, [10, 20], [])).toBe(100);
  });

  it('holds the watermark just below the earliest failed event so failures retry', () => {
    // succeeded {10, 30}, failed {20}. Only events < 20 are safe → 10.
    expect(advanceWatermark(undefined, [10, 30], [20])).toBe(10);
  });

  it('keeps the prior watermark when every key this run failed', () => {
    expect(advanceWatermark(40, [], [50, 60])).toBe(40);
  });

  it('returns undefined when there is no prior watermark and nothing is confirmable', () => {
    // The earliest fetched event failed; nothing below it succeeded.
    expect(advanceWatermark(undefined, [30], [10, 20])).toBeUndefined();
  });
});

describe('buildWatermarkCursor', () => {
  it('advances per language from the base using successes and failures', () => {
    const base = { processed_keys: { en: 5, fr: 100 } };
    const succeeded = new Map<string, number[]>([
      ['en', [10, 20]],
      ['de', [7]],
    ]);
    const failed = new Map<string, number[]>([['fr', [110]]]);
    expect(buildWatermarkCursor(base, succeeded, failed)).toEqual({
      processed_keys: { en: 20, de: 7, fr: 100 },
    });
  });

  it('preserves base languages untouched this run', () => {
    const base = { processed_keys: { en: 5, es: 9 } };
    expect(buildWatermarkCursor(base, new Map([['en', [12]]]), new Map())).toEqual({
      processed_keys: { en: 12, es: 9 },
    });
  });

  it('omits a language with no prior watermark whose earliest key failed', () => {
    const base = { processed_keys: {} };
    const succeeded = new Map<string, number[]>([['fr', [30]]]);
    const failed = new Map<string, number[]>([['fr', [10, 20]]]);
    expect(buildWatermarkCursor(base, succeeded, failed)).toEqual({ processed_keys: {} });
  });
});

describe('mergeCursor', () => {
  it('keeps disk languages not touched by the in-memory cursor', () => {
    const disk = { processed_keys: { en: 10, de: 3 } };
    const inMemory = { processed_keys: { en: 20 } };
    expect(mergeCursor(disk, inMemory)).toEqual({ processed_keys: { en: 20, de: 3 } });
  });

  it('lets the in-memory value win even when lower than disk (failure-safe)', () => {
    // A run that hit a failure holds its watermark below disk's pre-failure value; the
    // merge must not restore the higher disk value.
    const disk = { processed_keys: { en: 100 } };
    const inMemory = { processed_keys: { en: 49 } };
    expect(mergeCursor(disk, inMemory)).toEqual({ processed_keys: { en: 49 } });
  });

  it('does not mutate its inputs', () => {
    const disk = { processed_keys: { en: 10 } };
    const inMemory = { processed_keys: { en: 20 } };
    mergeCursor(disk, inMemory);
    expect(disk).toEqual({ processed_keys: { en: 10 } });
    expect(inMemory).toEqual({ processed_keys: { en: 20 } });
  });
});

describe('countCursorEntries', () => {
  it('returns 0 for an empty cursor', () => {
    expect(countCursorEntries(createEmptyCursor())).toBe(0);
  });

  it('counts the number of languages with a watermark', () => {
    expect(countCursorEntries({ processed_keys: { en: 1, fr: 2, de: 3 } })).toBe(3);
  });
});
