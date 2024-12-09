import { Field, DeepPartial } from '@directus/types';
import { CreateMissingLanguagesInDirectus } from '../../../../../common/enums/create-missing-languages-in-directus';
import { getConfig } from '../../../../../common/config/get-config';

export const createSettingsFields = (): Array<DeepPartial<Field>> => [
  {
    field: 'id',
    type: 'integer',
    meta: {
      readonly: getConfig().APP_MODE === 'production',
      hidden: getConfig().APP_MODE === 'production',
      interface: 'numeric',
    },
    schema: {
      numeric_precision: 32,
      numeric_scale: 0,
      is_nullable: false,
      is_primary_key: true,
      has_auto_increment: true,
    },
  },
  {
    field: 'language_collection',
    type: 'string',
    meta: {
      interface: 'input',
      readonly: getConfig().APP_MODE === 'production',
      hidden: getConfig().APP_MODE === 'production',
    },
  },
  {
    field: 'language_code_field',
    type: 'string',
    meta: {
      interface: 'input',
      readonly: getConfig().APP_MODE === 'production',
      hidden: getConfig().APP_MODE === 'production',
    },
  },
  {
    field: 'source_language',
    type: 'string',
    meta: {
      interface: 'input',
      readonly: getConfig().APP_MODE === 'production',
      hidden: getConfig().APP_MODE === 'production',
    },
  },
  {
    field: 'localazy_oauth_response',
    type: 'text',
    meta: {
      interface: 'input-multiline',
      readonly: getConfig().APP_MODE === 'production',
      hidden: getConfig().APP_MODE === 'production',
    },
  },
  {
    field: 'automated_upload',
    type: 'boolean',
    meta: {
      interface: 'boolean',
      readonly: getConfig().APP_MODE === 'production',
      hidden: getConfig().APP_MODE === 'production',
    },
    schema: {
      default_value: true,
    },
  },
  {
    field: 'automated_deprecation',
    type: 'boolean',
    meta: {
      interface: 'boolean',
      readonly: getConfig().APP_MODE === 'production',
      hidden: getConfig().APP_MODE === 'production',
    },
    schema: {
      default_value: true,
    },
  },
  {
    field: 'upload_existing_translations',
    type: 'boolean',
    meta: {
      interface: 'boolean',
      readonly: getConfig().APP_MODE === 'production',
      hidden: getConfig().APP_MODE === 'production',
    },
    schema: {
      default_value: false,
    },
  },
  {
    field: 'import_source_language',
    type: 'boolean',
    meta: {
      interface: 'boolean',
      readonly: getConfig().APP_MODE === 'production',
      hidden: getConfig().APP_MODE === 'production',
    },
    schema: {
      default_value: false,
    },
  },
  {
    field: 'skip_empty_strings',
    type: 'boolean',
    meta: {
      interface: 'boolean',
      readonly: getConfig().APP_MODE === 'production',
      hidden: getConfig().APP_MODE === 'production',
    },
    schema: {
      default_value: true,
    },
  },
  {
    field: 'create_missing_languages_in_directus',
    type: 'integer',
    meta: {
      readonly: getConfig().APP_MODE === 'production',
      hidden: getConfig().APP_MODE === 'production',
      interface: 'numeric',
    },
    schema: {
      default_value: CreateMissingLanguagesInDirectus.ONLY_NON_HIDDEN,
    },
  },
];
