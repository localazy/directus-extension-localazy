import { Field, DeepPartial } from '@directus/types';
import { getConfig } from '@localazy/directus-common';

export const createLocalazyDataFields = (): Array<DeepPartial<Field>> => [
  {
    field: 'id',
    type: 'integer',
    meta: {
      readonly: getConfig().APP_MODE === 'production',
      hidden: getConfig().APP_MODE === 'production',
      interface: 'numeric',
    },
    schema: {
      is_nullable: false,
      is_primary_key: true,
    },
  },
  {
    field: 'access_token',
    type: 'string',
    meta: {
      interface: 'input',
      readonly: getConfig().APP_MODE === 'production',
      hidden: getConfig().APP_MODE === 'production',
    },
    schema: {
      default_value: '',
    },
  },
  {
    field: 'user_id',
    type: 'string',
    meta: {
      interface: 'input',
      readonly: getConfig().APP_MODE === 'production',
      hidden: getConfig().APP_MODE === 'production',
    },
    schema: {
      default_value: '',
    },
  },
  {
    field: 'user_name',
    type: 'string',
    meta: {
      interface: 'input',
      readonly: getConfig().APP_MODE === 'production',
      hidden: getConfig().APP_MODE === 'production',
    },
    schema: {
      default_value: '',
    },
  },
  {
    field: 'project_id',
    type: 'string',
    meta: {
      interface: 'input',
      readonly: getConfig().APP_MODE === 'production',
      hidden: getConfig().APP_MODE === 'production',
    },
    schema: {
      default_value: '',
    },
  },
  {
    field: 'project_url',
    type: 'string',
    meta: {
      interface: 'input',
      readonly: getConfig().APP_MODE === 'production',
      hidden: getConfig().APP_MODE === 'production',
    },
    schema: {
      default_value: '',
    },
  },
  {
    field: 'project_name',
    type: 'string',
    meta: {
      interface: 'input',
      readonly: getConfig().APP_MODE === 'production',
      hidden: getConfig().APP_MODE === 'production',
    },
    schema: {
      default_value: '',
    },
  },
  {
    field: 'org_id',
    type: 'string',
    meta: {
      interface: 'input',
      readonly: getConfig().APP_MODE === 'production',
      hidden: getConfig().APP_MODE === 'production',
    },
    schema: {
      default_value: '',
    },
  },
];
