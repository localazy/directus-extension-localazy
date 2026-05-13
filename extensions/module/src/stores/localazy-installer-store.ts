import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useApi } from '@directus/extensions-sdk';
import type { DeepPartial, Field } from '@directus/types';
import { sleep } from '../../../common/utilities/sleep';
import { getConfig } from '../../../common/config/get-config';
import { useErrorsStore } from './errors-store';
import { useDirectusCollectionsStore, useDirectusFieldsStore } from '../composables/use-directus-stores';
import { defaultConfiguration } from '../data/default-configuration';
import { createSettingsFields } from '../data/fields/settings/create';
import { createContentTransferSetupsFields } from '../data/fields/content-transfer-setup/create';
import { createLocalazyDataFields } from '../data/fields/localazy-data/create';
import { createSyncStateFields } from '../data/fields/sync-state/create';
import { createSyncLogFields } from '../data/fields/sync-log/create';

/**
 * Collection names owned by this extension. Used by the installer and the per-singleton
 * stores. Don't hard-code these strings elsewhere — import the constant.
 */
export const LOCALAZY_COLLECTIONS = {
  groupingFolder: 'localazy_data',
  settings: 'localazy_settings',
  contentTransferSetup: 'localazy_content_transfer_setup',
  config: 'localazy_config_data',
  syncState: 'localazy_sync_state',
  syncLog: 'localazy_sync_log',
} as const;

type CollectionPlan = {
  name: string;
  fields: () => Array<DeepPartial<Field>>;
  /**
   * Per-row defaults patched into the singleton on first install. Omitted for non-singleton
   * collections (e.g. `localazy_sync_log`), which start empty.
   */
  defaults?: Record<string, unknown>;
  /**
   * Defaults to `true` (matches the existing Localazy collections, all singletons). Set
   * `false` for row-per-record tables that start empty and grow via inserts — the
   * installer skips the seed PATCH in that case.
   */
  singleton?: boolean;
};

/**
 * Boot-time installer for the Localazy plugin's collections. Runs once per session.
 *
 * Three concerns:
 *   1. Ensure the grouping folder + each Localazy collection exists (creating with seed
 *      row + initial fields if missing).
 *   2. Heal: if a collection exists but lacks fields we now declare, add them. The field
 *      declarations in `data/fields/*` are the source of truth — diff against the
 *      Directus fields store and POST whatever's missing.
 *   3. Gate consumer reads: the per-singleton stores only fetch once `installed` flips
 *      true, so we never race against a not-yet-created collection.
 *
 * No version tracking — schema migrations are declarative and idempotent. If we ever
 * need data-shape migrations (transforming row content across versions), handle them
 * separately with shape detection or backward-compatible reads.
 *
 * Replaces the old `useHydrate` composable's install/heal concerns plus its
 * "normalize-on-load" pattern (which was dropped — defaults belong at the consumer site).
 */
export const useLocalazyInstallerStore = defineStore('localazyInstaller', () => {
  const api = useApi();
  const { addDirectusError } = useErrorsStore();
  const collectionsStore = useDirectusCollectionsStore();
  const fieldsStore = useDirectusFieldsStore();

  const installing = ref(false);
  const installed = ref(false);
  let runPromise: Promise<void> | null = null;

  async function ensureFolder() {
    if (collectionsStore.getCollection(LOCALAZY_COLLECTIONS.groupingFolder)) return;
    await api.post('/collections', {
      collection: LOCALAZY_COLLECTIONS.groupingFolder,
      meta: {
        collection: LOCALAZY_COLLECTIONS.groupingFolder,
        icon: 'translate',
        note: 'Localazy grouping folder',
        hidden: getConfig().APP_MODE === 'production',
      },
      schema: null,
    });
    await sleep(100);
    await collectionsStore.hydrate();
  }

  async function ensureCollection(plan: CollectionPlan) {
    const isSingleton = plan.singleton ?? true;
    const existing = collectionsStore.getCollection(plan.name);
    if (!existing) {
      await api.post('/collections', {
        collection: plan.name,
        meta: {
          collection: plan.name,
          icon: 'translate',
          note: 'Collection data for the Localazy plugin',
          group: LOCALAZY_COLLECTIONS.groupingFolder,
          hidden: getConfig().APP_MODE === 'production',
          singleton: isSingleton,
          archive_app_filter: true,
        },
        schema: {},
        fields: plan.fields(),
      });
      await sleep(100);
      await collectionsStore.hydrate();
      await sleep(100);
      await fieldsStore.hydrate();
      await sleep(100);
      // Singleton collections get their default row patched in on first install. Row-per-record
      // tables (e.g. `localazy_sync_log`) start empty — no seed PATCH.
      if (isSingleton && plan.defaults) {
        await api.patch(`/items/${plan.name}`, { id: 1, ...plan.defaults });
      }
      return;
    }

    // Heal: declarative field check. Diff what we declare against what Directus reports
    // and POST any missing fields. The correct route is `/fields/{collection}` —
    // the old `/collections/{collection}/fields` was a 404 (latent bug pre-dating PR 21).
    const existingFields = fieldsStore.getFieldsForCollection(plan.name) as Field[];
    const missing = plan.fields().filter((f) => !existingFields.find((ef) => ef.field === f.field));
    if (missing.length === 0) return;

    for (const field of missing) {
      await api.post(`/fields/${plan.name}`, field);
      await sleep(100);
    }
    await fieldsStore.hydrate();
  }

  async function run(): Promise<void> {
    if (installed.value) return;
    if (runPromise) return runPromise;

    runPromise = (async () => {
      installing.value = true;
      try {
        await ensureFolder();
        await ensureCollection({
          name: LOCALAZY_COLLECTIONS.settings,
          fields: createSettingsFields,
          defaults: defaultConfiguration().settings,
        });
        await ensureCollection({
          name: LOCALAZY_COLLECTIONS.contentTransferSetup,
          fields: createContentTransferSetupsFields,
          defaults: defaultConfiguration().content_transfer_setup,
        });
        await ensureCollection({
          name: LOCALAZY_COLLECTIONS.config,
          fields: createLocalazyDataFields,
          defaults: defaultConfiguration().localazy_data,
        });
        await ensureCollection({
          name: LOCALAZY_COLLECTIONS.syncState,
          fields: createSyncStateFields,
          defaults: defaultConfiguration().sync_state,
        });
        // Non-singleton: row-per-session table. The installer creates the collection
        // and fields (heal-aware on subsequent runs), but never seeds a default row —
        // sync rows are inserted by the orchestrator's log writer on each run.
        await ensureCollection({
          name: LOCALAZY_COLLECTIONS.syncLog,
          fields: createSyncLogFields,
          singleton: false,
        });
        installed.value = true;
      } catch (e: unknown) {
        addDirectusError(e);
        // Reset so the caller can retry on next mount (e.g. after the admin grants
        // missing permissions). Re-running an idempotent install is safe.
        runPromise = null;
      } finally {
        installing.value = false;
      }
    })();

    return runPromise;
  }

  return { installing, installed, run };
});
