import { describe, it, expect } from 'vitest';
import { mergeWithArrays } from '../../utilities/merge-with-arrays';

describe('mergeWithArrays', () => {
  describe('array merging behavior', () => {
    it('should concatenate arrays instead of replacing', () => {
      const obj1 = { items: [1, 2, 3] };
      const obj2 = { items: [4, 5, 6] };

      const result = mergeWithArrays(obj1, obj2);

      expect(result.items).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('should handle empty arrays', () => {
      const obj1 = { items: [] };
      const obj2 = { items: [1, 2, 3] };

      const result = mergeWithArrays(obj1, obj2);

      expect(result.items).toEqual([1, 2, 3]);
    });

    it('should handle nested arrays', () => {
      const obj1 = { data: { items: ['a', 'b'] } };
      const obj2 = { data: { items: ['c', 'd'] } };

      const result = mergeWithArrays(obj1, obj2);

      expect(result.data.items).toEqual(['a', 'b', 'c', 'd']);
    });

    it('should handle arrays of objects', () => {
      const obj1 = { items: [{ id: 1 }, { id: 2 }] };
      const obj2 = { items: [{ id: 3 }] };

      const result = mergeWithArrays(obj1, obj2);

      expect(result.items).toHaveLength(3);
      expect(result.items[2]).toEqual({ id: 3 });
    });
  });

  describe('object merging behavior', () => {
    it('should merge non-array properties normally', () => {
      const obj1 = { name: 'original', value: 1 };
      const obj2 = { name: 'updated', extra: 'field' };

      const result = mergeWithArrays(obj1, obj2);

      expect(result.name).toBe('updated');
      expect(result.value).toBe(1);
      expect(result.extra).toBe('field');
    });

    it('should deep merge nested objects', () => {
      const obj1 = { settings: { theme: 'dark', language: 'en' } };
      const obj2 = { settings: { theme: 'light' } };

      const result = mergeWithArrays(obj1, obj2);

      expect(result.settings.theme).toBe('light');
      expect(result.settings.language).toBe('en');
    });

    it('should handle mixed array and object properties', () => {
      const obj1 = {
        name: 'test',
        items: [1, 2],
        config: { key: 'value' },
      };
      const obj2 = {
        name: 'updated',
        items: [3],
        config: { newKey: 'newValue' },
      };

      const result = mergeWithArrays(obj1, obj2);

      expect(result.name).toBe('updated');
      expect(result.items).toEqual([1, 2, 3]);
      expect(result.config).toEqual({ key: 'value', newKey: 'newValue' });
    });
  });

  describe('edge cases', () => {
    it('should handle null source', () => {
      const obj1 = { items: [1, 2] };

      const result = mergeWithArrays(obj1, null);

      expect(result.items).toEqual([1, 2]);
    });

    it('should handle undefined source', () => {
      const obj1 = { items: [1, 2] };

      const result = mergeWithArrays(obj1, undefined);

      expect(result.items).toEqual([1, 2]);
    });

    it('should handle empty objects', () => {
      const obj1 = {};
      const obj2 = { items: [1] };

      const result = mergeWithArrays(obj1, obj2);

      expect(result.items).toEqual([1]);
    });

    it('should handle deeply nested structures', () => {
      const obj1 = {
        level1: {
          level2: {
            level3: {
              items: ['a'],
            },
          },
        },
      };
      const obj2 = {
        level1: {
          level2: {
            level3: {
              items: ['b'],
            },
          },
        },
      };

      const result = mergeWithArrays(obj1, obj2);

      expect(result.level1.level2.level3.items).toEqual(['a', 'b']);
    });

    it('should preserve array order', () => {
      const obj1 = { items: [1, 3, 5] };
      const obj2 = { items: [2, 4, 6] };

      const result = mergeWithArrays(obj1, obj2);

      expect(result.items).toEqual([1, 3, 5, 2, 4, 6]);
    });
  });

  describe('type preservation', () => {
    it('should maintain string arrays', () => {
      const obj1 = { tags: ['vue', 'react'] };
      const obj2 = { tags: ['angular'] };

      const result = mergeWithArrays(obj1, obj2);

      expect(result.tags.every((t: any) => typeof t === 'string')).toBe(true);
    });

    it('should maintain number arrays', () => {
      const obj1 = { values: [1, 2, 3] };
      const obj2 = { values: [4, 5] };

      const result = mergeWithArrays(obj1, obj2);

      expect(result.values.every((v: any) => typeof v === 'number')).toBe(true);
    });

    it('should handle mixed type arrays', () => {
      const obj1 = { mixed: [1, 'two', { three: 3 }] };
      const obj2 = { mixed: [4, 'five'] };

      const result = mergeWithArrays(obj1, obj2);

      expect(result.mixed).toHaveLength(5);
    });
  });
});
