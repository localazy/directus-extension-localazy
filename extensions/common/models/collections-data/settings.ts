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
};
