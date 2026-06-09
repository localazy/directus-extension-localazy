/**
 * Canonical names of every Directus collection owned by this extension.
 *
 * Import this constant. Never hard-code these strings.
 *
 * IMPORTANT: `groupingFolder` is the UI folder/group registered in `directus_collections`
 * to group the other Localazy collections in the admin sidebar. It has NO backing table.
 * Reading it via `ItemsService(...).readByQuery(...)` throws inside Directus' schema
 * traversal (`schema.collections['localazy_data']` is `undefined`), which surfaces as an
 * unhandled rejection if the caller doesn't try/catch. Do NOT confuse it with `config`
 * (the actual single-row collection storing the OAuth token + project id).
 *
 * Past bug (PR 67-era): `extensions/sync-hook/src/endpoint/index.ts` declared a local
 * `LOCALAZY_COLLECTIONS` with `data: 'localazy_data'` (the folder name) instead of
 * `'localazy_config_data'`, which caused the webhook handler to hang on every delivery.
 * The duplicated local constant was the root cause — keep this file as the single source.
 */
export const LOCALAZY_COLLECTIONS = {
  /** UI grouping folder — no backing table. Used only by the installer. */
  groupingFolder: 'localazy_data',
  /** Singleton: master toggle + automated-import config. */
  settings: 'localazy_settings',
  /** Singleton: per-collection field-enable map for content sync. */
  contentTransferSetup: 'localazy_content_transfer_setup',
  /** Singleton: Localazy OAuth token + project id + cached project metadata. */
  config: 'localazy_config_data',
  /** Singleton: incremental-import cursor state. */
  syncState: 'localazy_sync_state',
  /** Row-per-session: Activity-page log of webhook + hook + manual sync runs. */
  syncLog: 'localazy_sync_log',
} as const;

export type LocalazyCollectionName = (typeof LOCALAZY_COLLECTIONS)[keyof typeof LOCALAZY_COLLECTIONS];
