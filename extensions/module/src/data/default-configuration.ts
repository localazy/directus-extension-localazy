import { CreateMissingLanguagesInDirectus } from '../../../common/enums/create-missing-languages-in-directus';
import { Configuration } from '../models/configuration';

export const defaultConfiguration = (): Configuration => ({
  settings: {
    language_collection: '',
    language_code_field: '',
    source_language: '',
    localazy_oauth_response: '',
    upload_existing_translations: 0,
    automated_upload: 1,
    automated_deprecation: 1,
    import_source_language: 0,
    skip_empty_strings: 1,
    create_missing_languages_in_directus: CreateMissingLanguagesInDirectus.ONLY_NON_HIDDEN,
  },
  content_transfer_setup: {
    enabled_fields: '[]',
    translation_strings: 1,
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
});
