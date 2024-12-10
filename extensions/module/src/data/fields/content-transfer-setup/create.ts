import { Field, DeepPartial } from '@directus/types';
import { getConfig } from '../../../../../common/config/get-config';

export const createContentTransferSetupsFields = (): Array<DeepPartial<Field>> => [
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
    field: 'enabled_fields',
    type: 'text',
    meta: {
      interface: 'input-multiline',
      options: {
        clear: true,
      },
      hidden: getConfig().APP_MODE === 'production',
    },
    schema: {
      default_value: '[]',
      is_nullable: false,
    },
  },
  {
    field: 'translation_strings',
    type: 'boolean',
    meta: {
      interface: 'boolean',
      special: [
        'cast-boolean',
      ],
      readonly: getConfig().APP_MODE === 'production',
      hidden: getConfig().APP_MODE === 'production',
    },
    schema: {
      default_value: true,
    },
  },
];
