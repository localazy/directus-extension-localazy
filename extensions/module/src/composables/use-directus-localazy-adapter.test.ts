import { describe, it, expect } from 'vitest';
import { extractLanguageCode } from './use-directus-localazy-adapter';

describe('extractLanguageCode', () => {
  it('returns the value when the FK column is a bare string', () => {
    expect(extractLanguageCode('en-US', 'code')).toBe('en-US');
  });

  it('reads the configured field off an expanded relation object', () => {
    expect(extractLanguageCode({ id: 1, code: 'en-US', name: 'English' }, 'code')).toBe('en-US');
  });

  it('respects a non-default code field (e.g. installations with `language` instead of `code`)', () => {
    expect(extractLanguageCode({ id: 1, language: 'fr-FR' }, 'language')).toBe('fr-FR');
  });

  it('returns undefined when the configured field is missing from the object', () => {
    expect(extractLanguageCode({ id: 1, name: 'English' }, 'code')).toBeUndefined();
  });

  it('returns undefined when the configured field is present but not a string', () => {
    expect(extractLanguageCode({ id: 1, code: 42 }, 'code')).toBeUndefined();
  });

  it('returns undefined for null / undefined input', () => {
    expect(extractLanguageCode(null, 'code')).toBeUndefined();
    expect(extractLanguageCode(undefined, 'code')).toBeUndefined();
  });

  it('returns undefined for non-string primitives', () => {
    expect(extractLanguageCode(42, 'code')).toBeUndefined();
    expect(extractLanguageCode(true, 'code')).toBeUndefined();
  });
});
