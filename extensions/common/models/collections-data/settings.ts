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
  /**
   * Master toggle for the automated-import feature added in PR E. When `false`, webhook
   * events received by the server-side bundle (PR F) are ignored; toggling on without a
   * webhook registered just means no events fire — the bundle itself does the gating.
   */
  automated_import: boolean;
  /**
   * UUID of the Directus user that webhook-driven writes are attributed to. The Automation
   * page filters the dropdown to Admin-role users only — webhook writes need full schema
   * access (FieldsService usage in the bundle), which only the Admin role guarantees.
   * Nullable; the bundle in PR F will refuse to act on webhook events until this is set.
   */
  automated_import_user: string | null;
  /**
   * JSON-encoded array of Localazy language codes (e.g. `["en","de"]`) the webhook handler
   * should import on a `project_published` event. Empty array means "fall back to
   * `resolveImportLanguages()`" — same semantics as the UI Import path's default.
   */
  automated_import_languages: string;
};
