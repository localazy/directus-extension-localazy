import { describe, it, expect } from 'vitest';
import {
  createEmptyUploadCursor,
  parseUploadCursor,
  serializeUploadCursor,
  recordUploadEntry,
  mergeUploadCursor,
  filterItemsByUploadCursor,
  countUploadCursorEntries,
  canonicalizeForHash,
  computeItemHash,
} from './upload-cursor';

describe('createEmptyUploadCursor', () => {
  it('returns a cursor with an empty uploaded_hashes map', () => {
    expect(createEmptyUploadCursor()).toEqual({ uploaded_hashes: {} });
  });
});

describe('parseUploadCursor', () => {
  it('returns empty cursor for null / undefined / empty string', () => {
    expect(parseUploadCursor(null)).toEqual({ uploaded_hashes: {} });
    expect(parseUploadCursor(undefined)).toEqual({ uploaded_hashes: {} });
    expect(parseUploadCursor('')).toEqual({ uploaded_hashes: {} });
  });

  it('parses a well-formed JSON map', () => {
    const raw = JSON.stringify({ posts: { '1': 'abc123', '2': 'def456' }, pages: { '1': 'aaa' } });
    expect(parseUploadCursor(raw)).toEqual({
      uploaded_hashes: { posts: { '1': 'abc123', '2': 'def456' }, pages: { '1': 'aaa' } },
    });
  });

  it('returns empty cursor for malformed JSON', () => {
    expect(parseUploadCursor('{not-json')).toEqual({ uploaded_hashes: {} });
  });

  it('returns empty cursor for non-object JSON (array / string / number)', () => {
    expect(parseUploadCursor('[1,2,3]')).toEqual({ uploaded_hashes: {} });
    expect(parseUploadCursor('"hello"')).toEqual({ uploaded_hashes: {} });
    expect(parseUploadCursor('42')).toEqual({ uploaded_hashes: {} });
  });

  it('drops non-string hash values silently', () => {
    const raw = JSON.stringify({ posts: { '1': 'abc', '2': 42, '3': null, '4': 'def' } });
    expect(parseUploadCursor(raw)).toEqual({ uploaded_hashes: { posts: { '1': 'abc', '4': 'def' } } });
  });

  it('drops empty-string hash values', () => {
    const raw = JSON.stringify({ posts: { '1': 'abc', '2': '' } });
    expect(parseUploadCursor(raw)).toEqual({ uploaded_hashes: { posts: { '1': 'abc' } } });
  });

  it('drops non-object per-collection buckets', () => {
    const raw = JSON.stringify({ posts: { '1': 'abc' }, pages: 'broken', users: null });
    expect(parseUploadCursor(raw)).toEqual({ uploaded_hashes: { posts: { '1': 'abc' } } });
  });
});

describe('serializeUploadCursor', () => {
  it('serializes the uploaded_hashes map to JSON', () => {
    expect(serializeUploadCursor({ uploaded_hashes: { posts: { '1': 'abc' } } })).toBe('{"posts":{"1":"abc"}}');
  });

  it('serializes empty cursor to empty object string', () => {
    expect(serializeUploadCursor(createEmptyUploadCursor())).toBe('{}');
  });

  it('round-trips through parseUploadCursor', () => {
    const original = { uploaded_hashes: { posts: { '1': 'abc', '2': 'def' }, pages: { '1': 'aaa' } } };
    expect(parseUploadCursor(serializeUploadCursor(original))).toEqual(original);
  });
});

describe('recordUploadEntry', () => {
  it('creates a new per-collection bucket if one does not exist', () => {
    const cursor = createEmptyUploadCursor();
    recordUploadEntry(cursor, 'posts', '1', 'abc');
    expect(cursor.uploaded_hashes).toEqual({ posts: { '1': 'abc' } });
  });

  it('records into an existing bucket without disturbing other cells', () => {
    const cursor = { uploaded_hashes: { posts: { '1': 'abc' } } };
    recordUploadEntry(cursor, 'posts', '2', 'def');
    expect(cursor.uploaded_hashes).toEqual({ posts: { '1': 'abc', '2': 'def' } });
  });

  it('overwrites the prior hash for the same cell', () => {
    const cursor = { uploaded_hashes: { posts: { '1': 'oldhash' } } };
    recordUploadEntry(cursor, 'posts', '1', 'newhash');
    expect(cursor.uploaded_hashes.posts).toEqual({ '1': 'newhash' });
  });

  it('is a no-op when hash is empty string', () => {
    const cursor = { uploaded_hashes: { posts: { '1': 'abc' } } };
    recordUploadEntry(cursor, 'posts', '1', '');
    expect(cursor.uploaded_hashes.posts).toEqual({ '1': 'abc' });
  });

  it('does not create a bucket when hash is empty', () => {
    const cursor = createEmptyUploadCursor();
    recordUploadEntry(cursor, 'pages', '1', '');
    expect(cursor.uploaded_hashes).toEqual({});
  });
});

describe('mergeUploadCursor', () => {
  it('returns identity-equivalent of either cursor when the other is empty', () => {
    const a = { uploaded_hashes: { posts: { '1': 'abc' } } };
    const empty = createEmptyUploadCursor();
    expect(mergeUploadCursor(a, empty)).toEqual(a);
    expect(mergeUploadCursor(empty, a)).toEqual(a);
  });

  it('combines disjoint collections', () => {
    const a = { uploaded_hashes: { posts: { '1': 'abc' } } };
    const b = { uploaded_hashes: { pages: { '2': 'def' } } };
    expect(mergeUploadCursor(a, b)).toEqual({ uploaded_hashes: { posts: { '1': 'abc' }, pages: { '2': 'def' } } });
  });

  it('combines disjoint items within the same collection', () => {
    const a = { uploaded_hashes: { posts: { '1': 'abc' } } };
    const b = { uploaded_hashes: { posts: { '2': 'def' } } };
    expect(mergeUploadCursor(a, b)).toEqual({ uploaded_hashes: { posts: { '1': 'abc', '2': 'def' } } });
  });

  it('right-hand cursor wins for overlapping cells (latest run is the truth)', () => {
    const a = { uploaded_hashes: { posts: { '1': 'oldhash', '2': 'kept' } } };
    const b = { uploaded_hashes: { posts: { '1': 'newhash' } } };
    expect(mergeUploadCursor(a, b)).toEqual({ uploaded_hashes: { posts: { '1': 'newhash', '2': 'kept' } } });
  });

  it('does not mutate the inputs', () => {
    const a = { uploaded_hashes: { posts: { '1': 'abc' } } };
    const b = { uploaded_hashes: { posts: { '1': 'def' } } };
    mergeUploadCursor(a, b);
    expect(a).toEqual({ uploaded_hashes: { posts: { '1': 'abc' } } });
    expect(b).toEqual({ uploaded_hashes: { posts: { '1': 'def' } } });
  });
});

describe('filterItemsByUploadCursor', () => {
  it('returns all items when no bucket exists for the collection (first-time export)', () => {
    const items = [
      { id: 1, hash: 'a' },
      { id: 2, hash: 'b' },
    ];
    expect(filterItemsByUploadCursor('posts', items, createEmptyUploadCursor())).toEqual(items);
  });

  it('skips items whose current hash matches the stored hash', () => {
    const items = [
      { id: 1, hash: 'a' },
      { id: 2, hash: 'b' },
    ];
    const cursor = { uploaded_hashes: { posts: { '1': 'a', '2': 'b' } } };
    expect(filterItemsByUploadCursor('posts', items, cursor)).toEqual([]);
  });

  it('includes items whose current hash differs from the stored hash', () => {
    const items = [{ id: 1, hash: 'newhash' }];
    const cursor = { uploaded_hashes: { posts: { '1': 'oldhash' } } };
    expect(filterItemsByUploadCursor('posts', items, cursor)).toEqual(items);
  });

  it('includes items not present in the cursor (newly-added items)', () => {
    const items = [
      { id: 1, hash: 'a' },
      { id: 2, hash: 'b' },
    ];
    const cursor = { uploaded_hashes: { posts: { '1': 'a' } } };
    expect(filterItemsByUploadCursor('posts', items, cursor)).toEqual([{ id: 2, hash: 'b' }]);
  });

  it('handles numeric item ids by stringifying for lookup', () => {
    const items = [{ id: 42, hash: 'a' }];
    const cursor = { uploaded_hashes: { posts: { '42': 'a' } } };
    expect(filterItemsByUploadCursor('posts', items, cursor)).toEqual([]);
  });

  it('handles string item ids (UUIDs)', () => {
    const items = [{ id: 'uuid-xyz', hash: 'a' }];
    const cursor = { uploaded_hashes: { posts: { 'uuid-xyz': 'a' } } };
    expect(filterItemsByUploadCursor('posts', items, cursor)).toEqual([]);
  });
});

describe('countUploadCursorEntries', () => {
  it('returns 0 for empty cursor', () => {
    expect(countUploadCursorEntries(createEmptyUploadCursor())).toBe(0);
  });

  it('sums per-collection map sizes', () => {
    const cursor = { uploaded_hashes: { posts: { '1': 'a', '2': 'b' }, pages: { '1': 'c' } } };
    expect(countUploadCursorEntries(cursor)).toBe(3);
  });
});

describe('canonicalizeForHash', () => {
  it('sorts object keys deterministically', () => {
    expect(canonicalizeForHash({ b: 1, a: 2 })).toBe(canonicalizeForHash({ a: 2, b: 1 }));
  });

  it('sorts nested object keys recursively', () => {
    expect(canonicalizeForHash({ outer: { z: 1, a: 2 } })).toBe(canonicalizeForHash({ outer: { a: 2, z: 1 } }));
  });

  it('omits undefined values from objects (treats as absent)', () => {
    expect(canonicalizeForHash({ a: 1, b: undefined })).toBe(canonicalizeForHash({ a: 1 }));
  });

  it('preserves null verbatim (distinct from absent)', () => {
    expect(canonicalizeForHash({ a: null })).not.toBe(canonicalizeForHash({}));
  });

  it('preserves empty strings verbatim', () => {
    expect(canonicalizeForHash({ a: '' })).not.toBe(canonicalizeForHash({}));
  });

  it('preserves whitespace verbatim', () => {
    expect(canonicalizeForHash({ a: '  hello  ' })).not.toBe(canonicalizeForHash({ a: 'hello' }));
  });

  it('preserves array order (order is part of identity)', () => {
    expect(canonicalizeForHash([1, 2, 3])).not.toBe(canonicalizeForHash([3, 2, 1]));
  });

  it('normalizes undefined inside arrays to null (JSON does not allow undefined elements)', () => {
    // Both canonicalizations resolve undefined-in-array → null, so they should be equal.
    expect(canonicalizeForHash([1, undefined, 3])).toBe(canonicalizeForHash([1, null, 3]));
  });

  it('distinguishes numbers from their string representations', () => {
    expect(canonicalizeForHash({ a: 1 })).not.toBe(canonicalizeForHash({ a: '1' }));
  });

  it('handles deeply nested structures', () => {
    const v1 = { collection: 'posts', items: { 1: { en: { title: 'hi' } } } };
    const v2 = { items: { 1: { en: { title: 'hi' } } }, collection: 'posts' };
    expect(canonicalizeForHash(v1)).toBe(canonicalizeForHash(v2));
  });

  it('returns "{}" for an empty object', () => {
    expect(canonicalizeForHash({})).toBe('{}');
  });

  it('returns "[]" for an empty array', () => {
    expect(canonicalizeForHash([])).toBe('[]');
  });
});

describe('computeItemHash', () => {
  it('produces a 16-character hex string', async () => {
    const hash = await computeItemHash({ a: 1 });
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('produces the same hash for equivalent inputs (key order independent)', async () => {
    const h1 = await computeItemHash({ a: 1, b: 2 });
    const h2 = await computeItemHash({ b: 2, a: 1 });
    expect(h1).toBe(h2);
  });

  it('produces different hashes for different inputs', async () => {
    const h1 = await computeItemHash({ a: 1 });
    const h2 = await computeItemHash({ a: 2 });
    expect(h1).not.toBe(h2);
  });

  it('produces different hashes for null vs absent fields', async () => {
    const h1 = await computeItemHash({ a: null });
    const h2 = await computeItemHash({});
    expect(h1).not.toBe(h2);
  });

  it('produces equal hashes for undefined vs absent fields', async () => {
    const h1 = await computeItemHash({ a: 1, b: undefined });
    const h2 = await computeItemHash({ a: 1 });
    expect(h1).toBe(h2);
  });

  it('produces equal hashes for empty objects regardless of construction', async () => {
    const h1 = await computeItemHash({});
    const h2 = await computeItemHash(Object.create(null));
    expect(h1).toBe(h2);
  });

  it('produces stable hashes across calls for the same input', async () => {
    const input = { collection: 'posts', items: { 1: { en: { title: 'hello' } } } };
    const h1 = await computeItemHash(input);
    const h2 = await computeItemHash(input);
    expect(h1).toBe(h2);
  });

  it('distinguishes empty string from absent', async () => {
    const h1 = await computeItemHash({ a: '' });
    const h2 = await computeItemHash({});
    expect(h1).not.toBe(h2);
  });

  it('distinguishes whitespace differences', async () => {
    const h1 = await computeItemHash({ a: 'hello' });
    const h2 = await computeItemHash({ a: 'hello ' });
    expect(h1).not.toBe(h2);
  });
});
