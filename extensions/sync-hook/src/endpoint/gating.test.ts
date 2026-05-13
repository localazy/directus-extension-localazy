import { describe, it, expect } from 'vitest';
import { decideGating, parseImportLanguages } from './gating';
import type { Settings } from '../../../common/models/collections-data/settings';
import { CreateMissingLanguagesInDirectus } from '../../../common/enums/create-missing-languages-in-directus';

function settings(overrides: Partial<Settings> = {}): Settings {
  return {
    automated_import: true,
    automated_import_user: 'user-uuid',
    automated_import_languages: '["en","de"]',
    activity_logs_sort: '{}',
    language_collection: 'languages',
    language_code_field: 'code',
    source_language: 'en',
    localazy_oauth_response: '',
    import_source_language: false,
    upload_existing_translations: false,
    automated_upload: false,
    automated_deprecation: false,
    skip_empty_strings: false,
    create_missing_languages_in_directus: CreateMissingLanguagesInDirectus.NO,
    language_mappings: '[]',
    ...overrides,
  };
}

describe('decideGating', () => {
  it('12a — master toggle off → skip (disabled)', () => {
    const decision = decideGating({
      settings: settings({ automated_import: false }),
      user: { id: 'u', userHasAdminAccess: true },
      userExists: true,
    });
    expect(decision).toEqual({ kind: 'skip', reason: 'disabled' });
  });

  it('12b — no automated_import_user → fail (no_user)', () => {
    const decision = decideGating({
      settings: settings({ automated_import_user: null }),
      user: null,
      userExists: false,
    });
    expect(decision).toEqual({ kind: 'fail', reason: 'no_user' });
  });

  it('12b takes precedence over user lookup outcomes', () => {
    // If automated_import_user is null, we shouldn't even attempt a lookup.
    const decision = decideGating({
      settings: settings({ automated_import_user: null }),
      user: { id: 'ghost', userHasAdminAccess: true },
      userExists: true,
    });
    expect(decision).toEqual({ kind: 'fail', reason: 'no_user' });
  });

  it('12c — user configured but not found → fail (user_missing)', () => {
    const decision = decideGating({ settings: settings(), user: null, userExists: false });
    expect(decision).toEqual({ kind: 'fail', reason: 'user_missing' });
  });

  it('12c — user found but admin_access=false → fail (user_not_admin)', () => {
    const decision = decideGating({
      settings: settings(),
      user: { id: 'user-uuid', userHasAdminAccess: false },
      userExists: true,
    });
    expect(decision).toEqual({ kind: 'fail', reason: 'user_not_admin' });
  });

  it('12d — empty languages → proceed with fallbackLanguages=true', () => {
    const decision = decideGating({
      settings: settings({ automated_import_languages: '[]' }),
      user: { id: 'user-uuid', userHasAdminAccess: true },
      userExists: true,
    });
    expect(decision).toEqual({ kind: 'proceed', importLanguages: [], fallbackLanguages: true });
  });

  it('12d — non-empty languages → proceed with fallbackLanguages=false', () => {
    const decision = decideGating({
      settings: settings({ automated_import_languages: '["en","de"]' }),
      user: { id: 'user-uuid', userHasAdminAccess: true },
      userExists: true,
    });
    expect(decision).toEqual({ kind: 'proceed', importLanguages: ['en', 'de'], fallbackLanguages: false });
  });

  it('corrupted JSON in automated_import_languages → falls back to empty array', () => {
    const decision = decideGating({
      settings: settings({ automated_import_languages: 'not-json{' }),
      user: { id: 'user-uuid', userHasAdminAccess: true },
      userExists: true,
    });
    expect(decision).toEqual({ kind: 'proceed', importLanguages: [], fallbackLanguages: true });
  });

  it('master toggle precedes user lookup outcomes', () => {
    // If automated_import is false, even a misconfigured user must NOT generate a
    // failed row — only the skipped row. Otherwise toggling off would flood the
    // Activity tab with one failure per webhook delivery.
    const decision = decideGating({
      settings: settings({ automated_import: false, automated_import_user: null }),
      user: null,
      userExists: false,
    });
    expect(decision.kind).toBe('skip');
  });
});

describe('parseImportLanguages', () => {
  it('parses a valid JSON array of strings', () => {
    expect(parseImportLanguages('["en","de"]')).toEqual(['en', 'de']);
  });

  it('returns [] for empty / falsy input', () => {
    expect(parseImportLanguages('')).toEqual([]);
    expect(parseImportLanguages('[]')).toEqual([]);
  });

  it('returns [] for malformed JSON', () => {
    expect(parseImportLanguages('not-json{')).toEqual([]);
  });

  it('returns [] for JSON that is not an array', () => {
    expect(parseImportLanguages('{"foo":"bar"}')).toEqual([]);
  });

  it('filters out non-string entries from a mixed array', () => {
    expect(parseImportLanguages('["en",1,null,"de"]')).toEqual(['en', 'de']);
  });
});
