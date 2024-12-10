import { CreateMissingLanguagesInDirectus } from '../../../common/enums/create-missing-languages-in-directus';
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
});
