import { CreateMissingLanguagesInDirectus } from '@localazy/directus-common';
import { CURSOR_VERSION } from '@localazy/directus-common';
import { Configuration } from '../models/configuration';

export const defaultConfiguration = (): Configuration => ({
  settings: {
    language_collection: '',
    language_code_field: '',
    source_language: '',
    localazy_oauth_response: '',
    upload_existing_translations: false,
    automated_upload: true,
    automated_deprecation: true,
    import_source_language: false,
    skip_empty_strings: true,
    create_missing_languages_in_directus: CreateMissingLanguagesInDirectus.ONLY_NON_HIDDEN,
    language_mappings: '[]',
    activity_logs_sort: '{}',
    automated_import: false,
    automated_import_user: null,
    automated_import_languages: '[]',
  },
  content_transfer_setup: {
    enabled_fields: '[]',
    translation_strings: true,
  },
  localazy_data: {
    access_token: '',
    user_id: '',
    user_name: '',
    project_id: '',
    project_url: '',
    project_name: '',
    org_id: '',
  },
  sync_state: {
    processed_keys: '{}',
    uploaded_hashes: '{}',
    cursor_project_id: '',
    cursor_version: CURSOR_VERSION,
    last_sync_at: null,
    sync_in_progress: false,
    sync_started_at: null,
    sync_initiator: '',
    sync_pending: false,
    sync_items_processed: 0,
    sync_last_heartbeat_at: null,
    acquired_token: '',
  },
});
