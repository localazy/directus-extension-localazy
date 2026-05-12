import { describe, it, expect } from 'vitest';
import { EnabledFieldsService } from './enabled-fields-service';
import { EnabledField } from '../models/collections-data/content-transfer-setup';

describe('EnabledFieldsService', () => {
  describe('parseFromDatabase', () => {
    it('parses a valid JSON array', () => {
      const stored = JSON.stringify([
        { collection: 'articles', field: 'title' },
        { collection: 'articles', field: 'body' },
      ]);
      const result = EnabledFieldsService.parseFromDatabase(stored);
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ collection: 'articles', field: 'title' });
    });

    it('returns an empty array when the stored value is not valid JSON', () => {
      expect(EnabledFieldsService.parseFromDatabase('not-json')).toEqual([]);
      expect(EnabledFieldsService.parseFromDatabase('')).toEqual([]);
    });
  });

  describe('prepareForDatabase', () => {
    it('serializes an array of enabled fields', () => {
      const input: EnabledField[] = [{ collection: 'articles', field: 'title' } as EnabledField];
      const result = EnabledFieldsService.prepareForDatabase(input);
      expect(JSON.parse(result)).toEqual(input);
    });

    it('returns an empty JSON array when input is not an array', () => {
      // Real-world: an upstream caller passes null/undefined when settings missing.
      expect(EnabledFieldsService.prepareForDatabase(null as unknown as EnabledField[])).toBe('[]');
      expect(EnabledFieldsService.prepareForDatabase(undefined as unknown as EnabledField[])).toBe('[]');
    });
  });
});
