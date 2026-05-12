import { describe, it, expect } from 'vitest';
import { EnabledFieldsService } from './enabled-fields-service';
import type { EnabledField } from '../models/collections-data/content-transfer-setup';

describe('EnabledFieldsService', () => {
  describe('parseFromDatabase', () => {
    it('parses a valid JSON array of EnabledFields', () => {
      const stored = JSON.stringify([
        { collection: 'articles', fields: ['title', 'body'] },
        { collection: 'pages', fields: ['name'] },
      ]);
      const result = EnabledFieldsService.parseFromDatabase(stored);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ collection: 'articles', fields: ['title', 'body'] });
      expect(result[1]).toEqual({ collection: 'pages', fields: ['name'] });
    });

    it('returns an empty array for an empty JSON array', () => {
      expect(EnabledFieldsService.parseFromDatabase('[]')).toEqual([]);
    });

    it('returns an empty array for malformed JSON', () => {
      expect(EnabledFieldsService.parseFromDatabase('[{invalid}]')).toEqual([]);
    });

    it('returns an empty array for non-JSON input', () => {
      expect(EnabledFieldsService.parseFromDatabase('not-json')).toEqual([]);
    });

    it('returns an empty array for an empty string', () => {
      expect(EnabledFieldsService.parseFromDatabase('')).toEqual([]);
    });
  });

  describe('prepareForDatabase', () => {
    it('serializes a valid array of EnabledFields', () => {
      const input: EnabledField[] = [
        { collection: 'articles', fields: ['title', 'body'] },
        { collection: 'pages', fields: ['name'] },
      ];
      const result = EnabledFieldsService.prepareForDatabase(input);
      expect(JSON.parse(result)).toEqual(input);
    });

    it('returns "[]" for an empty array', () => {
      expect(EnabledFieldsService.prepareForDatabase([])).toBe('[]');
    });

    // Defensive checks for upstream callers that may pass non-array values
    // when settings are missing or freshly initialised.
    const nonArrayCases: { label: string; value: unknown }[] = [
      { label: 'null', value: null },
      { label: 'undefined', value: undefined },
      { label: 'a plain string', value: 'not an array' },
      { label: 'a plain object', value: { collection: 'articles', fields: ['title'] } },
    ];
    for (const { label, value } of nonArrayCases) {
      it(`returns "[]" when given ${label}`, () => {
        expect(EnabledFieldsService.prepareForDatabase(value as EnabledField[])).toBe('[]');
      });
    }
  });

  describe('round trip', () => {
    it('survives a prepare -> parse cycle with original structure intact', () => {
      const original: EnabledField[] = [
        { collection: 'articles', fields: ['title', 'content', 'slug'] },
        { collection: 'pages', fields: ['name', 'body'] },
      ];
      const parsed = EnabledFieldsService.parseFromDatabase(EnabledFieldsService.prepareForDatabase(original));
      expect(parsed).toEqual(original);
    });
  });
});
