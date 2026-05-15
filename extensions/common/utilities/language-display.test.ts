import { describe, it, expect } from 'vitest';
import { pickLanguageName, formatLanguageOption } from './language-display';

describe('pickLanguageName', () => {
  it('prefers `name` over other candidates', () => {
    expect(pickLanguageName({ name: 'English', english_name: 'EN', label: 'Lang' })).toBe('English');
  });

  it('falls back through the candidate list in order', () => {
    expect(pickLanguageName({ english_name: 'English (US)' })).toBe('English (US)');
    expect(pickLanguageName({ label: 'English' })).toBe('English');
    expect(pickLanguageName({ language: 'English' })).toBe('English');
    expect(pickLanguageName({ title: 'English' })).toBe('English');
  });

  it('returns null when no candidate field has a usable string', () => {
    expect(pickLanguageName({})).toBeNull();
    expect(pickLanguageName(null)).toBeNull();
    expect(pickLanguageName(undefined)).toBeNull();
    expect(pickLanguageName({ name: '' })).toBeNull();
    expect(pickLanguageName({ name: '   ' })).toBeNull();
    expect(pickLanguageName({ name: 42 })).toBeNull();
  });

  it('ignores non-string values and unrelated columns', () => {
    expect(pickLanguageName({ name: null, code: 'en', direction: 'ltr' })).toBeNull();
  });

  it('trims surrounding whitespace', () => {
    expect(pickLanguageName({ name: '  English  ' })).toBe('English');
  });
});

describe('formatLanguageOption', () => {
  it('renders `Name (code)` when a name is provided', () => {
    expect(formatLanguageOption('en', 'English')).toBe('English (en)');
  });

  it('returns just the code when no name is provided', () => {
    expect(formatLanguageOption('en', null)).toBe('en');
    expect(formatLanguageOption('en', undefined)).toBe('en');
    expect(formatLanguageOption('en', '')).toBe('en');
  });

  it('returns just the code when name equals the code', () => {
    expect(formatLanguageOption('en', 'en')).toBe('en');
  });
});
