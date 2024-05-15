import { CreateMissingLanguagesInDirectus } from '../../enums/create-missing-languages-in-directus';

export type Settings = {
  language_collection: string;
  language_code_field: string;
  source_language: string;
  localazy_oauth_response: string;
  import_source_language: 0 | 1;
  upload_existing_translations: 0 | 1;
  automated_upload: 0 | 1;
  automated_deprecation: 0 | 1;
  skip_empty_strings: 0 | 1;
  create_missing_languages_in_directus: CreateMissingLanguagesInDirectus;
};
