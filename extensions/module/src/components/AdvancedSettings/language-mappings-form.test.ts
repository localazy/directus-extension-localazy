import { describe, it, expect } from 'vitest';
import {
  parseLanguageMappings,
  serializeLanguageMappings,
  validateMappingRow,
  hasMappingErrors,
  type MappingCodes,
} from './language-mappings-form';

describe('parseLanguageMappings', () => {
  it('returns an empty array for null / undefined / empty input', () => {
    expect(parseLanguageMappings(null)).toEqual([]);
    expect(parseLanguageMappings(undefined)).toEqual([]);
    expect(parseLanguageMappings('')).toEqual([]);
  });

  it('parses a well-formed payload', () => {
    const json = JSON.stringify([
      { directusCode: 'zh-Hans', localazyCode: 'zh-CN#Hans' },
      { directusCode: 'pt-BR', localazyCode: 'pt_BR' },
    ]);
    expect(parseLanguageMappings(json)).toEqual([
      { directusCode: 'zh-Hans', localazyCode: 'zh-CN#Hans' },
      { directusCode: 'pt-BR', localazyCode: 'pt_BR' },
    ]);
  });

  it('returns [] on malformed JSON instead of throwing', () => {
    expect(parseLanguageMappings('{not json')).toEqual([]);
  });

  it('returns [] when the payload is not an array', () => {
    expect(parseLanguageMappings('{"directusCode":"x"}')).toEqual([]);
  });

  it('drops entries that do not look like mappings', () => {
    const json = JSON.stringify([
      { directusCode: 'pt-BR', localazyCode: 'pt_BR' },
      { directusCode: 42, localazyCode: 'pt_BR' },
      null,
      { localazyCode: 'pt_BR' },
    ]);
    expect(parseLanguageMappings(json)).toEqual([{ directusCode: 'pt-BR', localazyCode: 'pt_BR' }]);
  });

  it('keeps only the two known fields and ignores extras (e.g. legacy description)', () => {
    const json = JSON.stringify([{ directusCode: 'zh-Hans', localazyCode: 'zh-CN#Hans', description: 'legacy' }]);
    expect(parseLanguageMappings(json)).toEqual([{ directusCode: 'zh-Hans', localazyCode: 'zh-CN#Hans' }]);
  });
});

describe('serializeLanguageMappings', () => {
  it('round-trips a clean list', () => {
    const rows: MappingCodes[] = [
      { directusCode: 'zh-Hans', localazyCode: 'zh-CN#Hans' },
      { directusCode: 'pt-BR', localazyCode: 'pt_BR' },
    ];
    expect(serializeLanguageMappings(rows)).toBe(JSON.stringify(rows));
  });

  it('drops draft rows where either code is blank', () => {
    const rows: MappingCodes[] = [
      { directusCode: 'zh-Hans', localazyCode: 'zh-CN#Hans' },
      { directusCode: '', localazyCode: 'pt_BR' },
      { directusCode: 'fr-CA', localazyCode: '' },
      { directusCode: '', localazyCode: '' },
    ];
    expect(serializeLanguageMappings(rows)).toBe(JSON.stringify([{ directusCode: 'zh-Hans', localazyCode: 'zh-CN#Hans' }]));
  });

  it('emits an empty array when every row is a draft', () => {
    expect(serializeLanguageMappings([{ directusCode: '', localazyCode: '' }])).toBe('[]');
  });
});

describe('validateMappingRow', () => {
  it('reports missing values with field-specific copy', () => {
    const row: MappingCodes = { directusCode: '', localazyCode: '' };
    const errors = validateMappingRow(row, [row], 0);
    expect(errors.directusCode).toBe('Select a Directus language');
    expect(errors.localazyCode).toBe('Select a Localazy locale');
  });

  it('flags duplicate Directus codes on the row that collides', () => {
    const rows: MappingCodes[] = [
      { directusCode: 'pt-BR', localazyCode: 'pt_BR' },
      { directusCode: 'pt-BR', localazyCode: 'pt_PT' },
    ];
    const errors = validateMappingRow(rows[1]!, rows, 1);
    expect(errors.directusCode).toBe('Duplicate Directus code "pt-BR"');
    expect(errors.localazyCode).toBeNull();
  });

  it('flags duplicate Localazy codes', () => {
    const rows: MappingCodes[] = [
      { directusCode: 'pt-BR', localazyCode: 'pt_BR' },
      { directusCode: 'pt-PT', localazyCode: 'pt_BR' },
    ];
    const errors = validateMappingRow(rows[1]!, rows, 1);
    expect(errors.localazyCode).toBe('Duplicate Localazy code "pt_BR"');
  });

  it('does not consider a row to duplicate itself', () => {
    const rows: MappingCodes[] = [{ directusCode: 'pt-BR', localazyCode: 'pt_BR' }];
    const errors = validateMappingRow(rows[0]!, rows, 0);
    expect(errors.directusCode).toBeNull();
    expect(errors.localazyCode).toBeNull();
  });
});

describe('hasMappingErrors', () => {
  it('returns false for an empty list', () => {
    expect(hasMappingErrors([])).toBe(false);
  });

  it('returns false for a fully valid list', () => {
    expect(
      hasMappingErrors([
        { directusCode: 'zh-Hans', localazyCode: 'zh-CN#Hans' },
        { directusCode: 'pt-BR', localazyCode: 'pt_BR' },
      ]),
    ).toBe(false);
  });

  it('returns true when any row has a blank code (drafts gate save)', () => {
    expect(hasMappingErrors([{ directusCode: 'zh-Hans', localazyCode: '' }])).toBe(true);
  });

  it('returns true on duplicates', () => {
    expect(
      hasMappingErrors([
        { directusCode: 'pt-BR', localazyCode: 'pt_BR' },
        { directusCode: 'pt-BR', localazyCode: 'pt_PT' },
      ]),
    ).toBe(true);
  });
});
