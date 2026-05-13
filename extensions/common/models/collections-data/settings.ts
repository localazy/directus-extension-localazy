import { CreateMissingLanguagesInDirectus } from '../../enums/create-missing-languages-in-directus';

export type Settings = {
  language_collection: string;
  language_code_field: string;
  source_language: string;
  localazy_oauth_response: string;
  import_source_language: boolean;
  upload_existing_translations: boolean;
  automated_upload: boolean;
  automated_deprecation: boolean;
  skip_empty_strings: boolean;
  create_missing_languages_in_directus: CreateMissingLanguagesInDirectus;
  /** JSON-encoded array of `LanguageMapping` rows. Empty string or `"[]"` means none. */
  language_mappings: string;
  /**
   * Per-tab sort preferences for the Activity page. JSON-encoded
   * `{ [tab]: { key: string; direction: 'asc' | 'desc' } }`. Empty object means "fall
   * back to the per-tab default" (status desc / startedAt desc, etc.). Persisted so a
   * user's chosen ordering survives module reloads.
   */
  activity_logs_sort: string;
};
