import { Field, DeepPartial } from '@directus/types';
import { CURSOR_VERSION } from '../../../../../common/models/collections-data/sync-state';
import { getConfig } from '../../../../../common/config/get-config';

/**
 * Schema for the `localazy_sync_state` singleton. Mirrors the wiring pattern used by
 * `localazy_settings` and `localazy_data` (see `localazy-installer-store.ts`).
 *
 * `processed_keys` holds the JSON-encoded download-sync cursor — a per-`(language, key id)`
 * map of the last `event` number we successfully applied. `uploaded_hashes` holds the
 * JSON-encoded upload-sync cursor — a per-`(collection, item id)` map of the 16-hex-char
 * SHA-256 of the canonical KV payload we last successfully uploaded for that item.
 * `cursor_project_id` ties both cursors to a specific Localazy project; the sync code
 * wipes them in-memory if the stored value diverges from the current project id.
 * `cursor_version` is reserved for future schema changes to the on-disk shape.
 *
 * The file also defines the advisory-lock field group (`sync_in_progress`,
 * `sync_started_at`, `sync_initiator`, `sync_pending`, `sync_items_processed`,
 * `sync_last_heartbeat_at`, `acquired_token`) used to serialise concurrent Import
 * flows. The semantics — CAS-style acquire/heartbeat/release, dirty-bit re-fire,
 * heartbeat-staleness and 2 h hard-ceiling takeover — live in
 * `common/services/orchestrator/incremental-import-orchestrator.ts` and the
 * timing constants in `common/services/orchestrator/lock-constants.ts`. Per-field
 * docs live on the model.
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
    field: 'uploaded_hashes',
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
  /* --------------------- Advisory sync lock fields --------------------- */
  {
    field: 'sync_in_progress',
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
    field: 'sync_started_at',
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
    field: 'sync_initiator',
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
    field: 'sync_pending',
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
    field: 'sync_items_processed',
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
    field: 'sync_last_heartbeat_at',
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
    field: 'acquired_token',
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
