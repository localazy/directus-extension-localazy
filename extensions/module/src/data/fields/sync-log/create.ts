import { Field, DeepPartial } from '@directus/types';
import { getConfig } from '../../../../../common/config/get-config';

/**
 * Schema for the `localazy_sync_log` collection. Unlike the other Localazy collections
 * (which are singletons), this one is a row-per-session table — capped to the last 100
 * sessions by the module-side `SyncLogWriter.finish` trim, which runs after every sync.
 *
 * Field design notes:
 *   - `id` is a UUID generated client-side at session start so the orchestrator can pass
 *     it through to `appendEntry` / `finish` without a roundtrip.
 *   - `event_type` and `status` are free strings (not enums) by design — PR F adds a
 *     `webhook` event type and a future `manual-override` initiator without a schema
 *     migration. The Activity page tab grouping is purely a UI mapping in the module.
 *   - `entries` is JSON-encoded text (a `SyncLogEntry[]`). Read-modify-write on append
 *     is acceptable because PR D scope is milestone-only logging (≤20 entries per
 *     session typical). A separate row-per-entry collection would be future work if
 *     verbose logging ever lands.
 *   - `initiator_user` is m2o → `directus_users`, kept for forward compatibility with a
 *     future name-resolution lookup in the Activity UI (currently displays the raw id).
 *     Nullable because webhook-triggered runs have no Directus user.
 *
 * The `readonly`/`hidden` flags mirror the other Localazy collections in production —
 * the rows are write-once from the module / hook, and surfaced via the Activity page
 * instead of Directus' own admin UI.
 */
export const createSyncLogFields = (): Array<DeepPartial<Field>> => [
  {
    field: 'id',
    type: 'uuid',
    meta: {
      readonly: getConfig().APP_MODE === 'production',
      hidden: getConfig().APP_MODE === 'production',
      interface: 'input',
      special: ['uuid'],
    },
    schema: {
      is_nullable: false,
      is_primary_key: true,
      has_auto_increment: false,
    },
  },
  {
    field: 'event_type',
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
    field: 'status',
    type: 'string',
    meta: {
      interface: 'input',
      readonly: getConfig().APP_MODE === 'production',
      hidden: getConfig().APP_MODE === 'production',
    },
    schema: {
      default_value: 'in_progress',
    },
  },
  {
    field: 'started_at',
    type: 'timestamp',
    meta: {
      interface: 'datetime',
      readonly: getConfig().APP_MODE === 'production',
      hidden: getConfig().APP_MODE === 'production',
    },
    schema: {
      default_value: null,
      is_nullable: true,
    },
  },
  {
    field: 'finished_at',
    type: 'timestamp',
    meta: {
      interface: 'datetime',
      readonly: getConfig().APP_MODE === 'production',
      hidden: getConfig().APP_MODE === 'production',
    },
    schema: {
      default_value: null,
      is_nullable: true,
    },
  },
  {
    field: 'initiator',
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
  /**
   * M2O → directus_users. The relation is created implicitly by Directus when a field of
   * type `uuid` with `special: ['m2o']` is declared and the schema points at the related
   * table. Kept nullable so webhook-triggered runs (no Directus user) can store `null`.
   */
  {
    field: 'initiator_user',
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
    // `on_delete` isn't in `@directus/schema`'s `Column` interface (it's a FK trigger,
    // not a column attribute), but Directus' POST /fields/{collection} endpoint accepts
    // it on the schema block and threads it through to the underlying relation. Cast at
    // the property level so the rest of the schema retains real typing.
    schema: {
      default_value: null,
      is_nullable: true,
      foreign_key_table: 'directus_users',
      foreign_key_column: 'id',
      // SET NULL on delete so removing a Directus user doesn't fail when sync_log rows
      // reference them. Directus' default is RESTRICT, which would block the user-row
      // delete on any retained session that ran under that user.
      on_delete: 'SET NULL',
    } as DeepPartial<Field>['schema'] & { on_delete: 'SET NULL' },
  },
  {
    field: 'summary',
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
    field: 'items_processed',
    type: 'integer',
    meta: {
      interface: 'numeric',
      readonly: getConfig().APP_MODE === 'production',
      hidden: getConfig().APP_MODE === 'production',
    },
    schema: {
      default_value: 0,
    },
  },
  {
    field: 'entries',
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
