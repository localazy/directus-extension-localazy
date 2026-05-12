import { describe, it, expect } from 'vitest';
import { mergeWithArrays } from './merge-with-arrays';

describe('mergeWithArrays', () => {
  describe('array values', () => {
    it('concatenates arrays instead of replacing them', () => {
      const result = mergeWithArrays({ tags: ['a', 'b'] }, { tags: ['c'] });
      expect(result.tags).toEqual(['a', 'b', 'c']);
    });

    it('concatenates onto an empty target array', () => {
      const result = mergeWithArrays({ items: [] }, { items: [1, 2, 3] });
      expect(result.items).toEqual([1, 2, 3]);
    });

    it('preserves array order (target first, source appended)', () => {
      const result = mergeWithArrays({ items: [1, 3, 5] }, { items: [2, 4, 6] });
      expect(result.items).toEqual([1, 3, 5, 2, 4, 6]);
    });

    it('concatenates arrays of objects', () => {
      const result = mergeWithArrays({ items: [{ id: 1 }, { id: 2 }] }, { items: [{ id: 3 }] });
      expect(result.items).toHaveLength(3);
      expect(result.items[2]).toEqual({ id: 3 });
    });

    it('concatenates arrays nested inside objects', () => {
      const result = mergeWithArrays({ groups: { admins: ['alice'] } }, { groups: { admins: ['bob'] } });
      expect(result.groups.admins).toEqual(['alice', 'bob']);
    });

    it('concatenates arrays at deep nesting levels', () => {
      const result = mergeWithArrays({ a: { b: { c: { items: ['x'] } } } }, { a: { b: { c: { items: ['y'] } } } });
      expect(result.a.b.c.items).toEqual(['x', 'y']);
    });
  });

  describe('object values', () => {
    it('uses lodash merge semantics for non-array values', () => {
      const result = mergeWithArrays({ config: { mode: 'dev', timeout: 100 } }, { config: { timeout: 200, retries: 3 } });
      expect(result.config).toEqual({ mode: 'dev', timeout: 200, retries: 3 });
    });

    it('keeps target keys that are absent from source', () => {
      const result = mergeWithArrays({ kept: 1, also: [1, 2] }, { also: [3] });
      expect(result).toEqual({ kept: 1, also: [1, 2, 3] });
    });

    it('handles a mix of array and object properties on the same object', () => {
      const result = mergeWithArrays(
        { name: 'original', items: [1, 2], config: { key: 'value' } },
        { name: 'updated', items: [3], config: { newKey: 'newValue' } },
      );
      expect(result).toEqual({
        name: 'updated',
        items: [1, 2, 3],
        config: { key: 'value', newKey: 'newValue' },
      });
    });
  });

  describe('edge cases', () => {
    it('returns target unchanged when source is null', () => {
      const result = mergeWithArrays({ items: [1, 2] }, null);
      expect(result.items).toEqual([1, 2]);
    });

    it('returns target unchanged when source is undefined', () => {
      const result = mergeWithArrays({ items: [1, 2] }, undefined);
      expect(result.items).toEqual([1, 2]);
    });

    it('adopts source keys onto an empty target', () => {
      const result = mergeWithArrays({}, { items: [1] });
      expect(result).toEqual({ items: [1] });
    });
  });
});
