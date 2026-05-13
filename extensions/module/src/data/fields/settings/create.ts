import { Field, DeepPartial } from '@directus/types';
import { CreateMissingLanguagesInDirectus } from '../../../../../common/enums/create-missing-languages-in-directus';
import { getConfig } from '../../../../../common/config/get-config';

/**
 * Directus' `@directus/schema` `Column` type doesn't declare FK trigger attributes
 * (`foreign_key_table`, `foreign_key_column`, `on_delete`) — they're surfaced by the
 * `/fields/{collection}` route, not the column metadata. Mirror the helper used in
 * sync-log's M2O field so the rest of the schema block keeps its real typing.
 */
type FkSchema = DeepPartial<Field>['schema'] & {
  foreign_key_table: string;
  foreign_key_column: string;
  on_delete: 'SET NULL' | 'CASCADE' | 'RESTRICT';
};

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
      is_nullable: false,
      is_primary_key: true,
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
    schema: {
      default_value: '',
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
    schema: {
      default_value: '',
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
    schema: {
      default_value: '',
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
    schema: {
      default_value: '',
    },
  },
  {
    field: 'automated_upload',
    type: 'boolean',
    meta: {
      interface: 'boolean',
      special: ['cast-boolean'],
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
      special: ['cast-boolean'],
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
      special: ['cast-boolean'],
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
      special: ['cast-boolean'],
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
      special: ['cast-boolean'],
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
  {
    field: 'language_mappings',
    type: 'text',
    meta: {
      interface: 'input-multiline',
      readonly: getConfig().APP_MODE === 'production',
      hidden: getConfig().APP_MODE === 'production',
    },
    schema: {
      default_value: '[]',
    },
  },
  /**
   * Per-tab sort preferences for the Activity page. JSON-encoded
   * `{ [tabName]: { key: SortKey; direction: 'asc' | 'desc' } }`. An empty `'{}'` means
   * "fall back to the per-tab default" (newest-first by startedAt). Persisted so a
   * user's chosen ordering survives module reloads.
   */
  {
    field: 'activity_logs_sort',
    type: 'text',
    meta: {
      interface: 'input-multiline',
      readonly: getConfig().APP_MODE === 'production',
      hidden: getConfig().APP_MODE === 'production',
    },
    schema: {
      default_value: '{}',
    },
  },
  /**
   * Automated-import master toggle. Off by default — the feature is opt-in. The webhook
   * handler in PR F reads this before acting on a `project_published` event.
   */
  {
    field: 'automated_import',
    type: 'boolean',
    meta: {
      interface: 'boolean',
      special: ['cast-boolean'],
      readonly: getConfig().APP_MODE === 'production',
      hidden: getConfig().APP_MODE === 'production',
    },
    schema: {
      default_value: false,
    },
  },
  /**
   * M2O → directus_users. Same FK pattern as `localazy_sync_log.initiator_user` —
   * `SET NULL` on delete so removing the Directus user doesn't cascade-block. Nullable
   * because a fresh install has no user selected yet; the Automation page surfaces a
   * dropdown filtered to Admin-role users only.
   */
  {
    field: 'automated_import_user',
    type: 'uuid',
    meta: {
      interface: 'select-dropdown-m2o',
      special: ['m2o'],
      readonly: getConfig().APP_MODE === 'production',
      hidden: getConfig().APP_MODE === 'production',
      options: {
        template: '{{first_name}} {{last_name}}',
      },
    },
    schema: {
      default_value: null,
      is_nullable: true,
      foreign_key_table: 'directus_users',
      foreign_key_column: 'id',
      on_delete: 'SET NULL',
    } as FkSchema,
  },
  /**
   * JSON-encoded array of language codes the webhook handler should import. Empty `'[]'`
   * means "fall back to `resolveImportLanguages()`" — same default as the UI Import path,
   * so an operator who enables the toggle without touching this field gets sensible
   * behaviour out of the box.
   */
  {
    field: 'automated_import_languages',
    type: 'text',
    meta: {
      interface: 'input-multiline',
      readonly: getConfig().APP_MODE === 'production',
      hidden: getConfig().APP_MODE === 'production',
    },
    schema: {
      default_value: '[]',
    },
  },
];
