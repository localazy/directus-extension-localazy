import { Field, DeepPartial } from '@directus/types';
import { CURSOR_VERSION } from '../../../../../common/models/collections-data/sync-state';
import { getConfig } from '../../../../../common/config/get-config';

/**
 * Schema for the `localazy_sync_state` singleton. Mirrors the wiring pattern used by
 * `localazy_settings` and `localazy_data` (see `localazy-installer-store.ts`).
 *
 * `processed_keys` holds the JSON-encoded download-sync cursor — a per-`(language, key id)`
 * map of the last `event` number we successfully applied. `cursor_project_id` ties the
 * cursor to a specific Localazy project; the sync code wipes the cursor in-memory if the
 * stored value diverges from the current project id. `cursor_version` is reserved for
 * future schema changes to the on-disk shape.
 */
export const createSyncStateFields = (): Array<DeepPartial<Field>> => [
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
    field: 'processed_keys',
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
  {
    field: 'cursor_project_id',
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
    field: 'cursor_version',
    type: 'integer',
    meta: {
      readonly: getConfig().APP_MODE === 'production',
      hidden: getConfig().APP_MODE === 'production',
      interface: 'numeric',
    },
    schema: {
      default_value: CURSOR_VERSION,
    },
  },
  {
    field: 'last_sync_at',
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
];
