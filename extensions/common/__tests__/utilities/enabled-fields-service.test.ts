import { describe, it, expect } from 'vitest';
import { EnabledFieldsService } from '../../utilities/enabled-fields-service';

describe('EnabledFieldsService', () => {
  describe('parseFromDatabase', () => {
    it('should parse valid JSON array', () => {
      const input = JSON.stringify([
        { collection: 'articles', fields: ['title', 'content'] },
        { collection: 'pages', fields: ['name'] },
      ]);

      const result = EnabledFieldsService.parseFromDatabase(input);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ collection: 'articles', fields: ['title', 'content'] });
      expect(result[1]).toEqual({ collection: 'pages', fields: ['name'] });
    });

    it('should return empty array for empty JSON array', () => {
      const result = EnabledFieldsService.parseFromDatabase('[]');
      expect(result).toEqual([]);
    });

    it('should return empty array for invalid JSON', () => {
      const result = EnabledFieldsService.parseFromDatabase('not valid json');
      expect(result).toEqual([]);
    });

    it('should return empty array for empty string', () => {
      const result = EnabledFieldsService.parseFromDatabase('');
      expect(result).toEqual([]);
    });

    it('should return empty array for malformed JSON', () => {
      const result = EnabledFieldsService.parseFromDatabase('[{invalid}]');
      expect(result).toEqual([]);
    });

    it('should handle nested objects', () => {
      const input = JSON.stringify([
        {
          collection: 'articles',
          fields: ['title'],
          nested: { key: 'value' },
        },
      ]);

      const result = EnabledFieldsService.parseFromDatabase(input);

      expect(result[0]).toHaveProperty('nested');
    });
  });

  describe('prepareForDatabase', () => {
    it('should stringify valid array', () => {
      const input = [
        { collection: 'articles', fields: ['title', 'content'] },
        { collection: 'pages', fields: ['name'] },
      ];

      const result = EnabledFieldsService.prepareForDatabase(input);
      const parsed = JSON.parse(result);

      expect(parsed).toHaveLength(2);
      expect(parsed[0]).toEqual(input[0]);
    });

    it('should return empty array string for empty array', () => {
      const result = EnabledFieldsService.prepareForDatabase([]);
      expect(result).toBe('[]');
    });

    it('should return empty array string for non-array input', () => {
      const result = EnabledFieldsService.prepareForDatabase('not an array' as any);
      expect(result).toBe('[]');
    });

    it('should return empty array string for null', () => {
      const result = EnabledFieldsService.prepareForDatabase(null as any);
      expect(result).toBe('[]');
    });

    it('should return empty array string for undefined', () => {
      const result = EnabledFieldsService.prepareForDatabase(undefined as any);
      expect(result).toBe('[]');
    });

    it('should return empty array string for object', () => {
      const result = EnabledFieldsService.prepareForDatabase({ key: 'value' } as any);
      expect(result).toBe('[]');
    });

    it('should preserve field structure', () => {
      const input = [{ collection: 'test', fields: ['a', 'b', 'c'] }];
      const result = EnabledFieldsService.prepareForDatabase(input);
      const parsed = JSON.parse(result);

      expect(parsed[0].fields).toEqual(['a', 'b', 'c']);
    });
  });

  describe('roundtrip', () => {
    it('should maintain data integrity through parse and prepare cycle', () => {
      const original = [
        { collection: 'articles', fields: ['title', 'content', 'slug'] },
        { collection: 'pages', fields: ['name', 'body'] },
      ];

      const stringified = EnabledFieldsService.prepareForDatabase(original);
      const parsed = EnabledFieldsService.parseFromDatabase(stringified);

      expect(parsed).toEqual(original);
    });
  });
});
