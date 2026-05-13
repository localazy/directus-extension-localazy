import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { useApi } from '@directus/extensions-sdk';
import { useLocalazyInstallerStore, LOCALAZY_COLLECTIONS } from './localazy-installer-store';
import { useErrorsStore } from './errors-store';
import type { SyncLogSession } from '../../../common/models/collections-data/sync-log';

/**
 * Row-per-record store for `localazy_sync_log`. Unlike the other Localazy collections
 * (singletons), this one is a list — gated on the installer the same way, but reads
 * fetch the most-recent N sessions sorted by `started_at` descending.
 *
 * Kept minimal on purpose: filter / sort / pagination live in the Activity page
 * composable. This store just holds the in-memory list and exposes a `reload` to
 * refresh it.
 */
export const useLocalazySyncLogStore = defineStore('localazySyncLog', () => {
  const installer = useLocalazyInstallerStore();
  const api = useApi();
  const { addDirectusError } = useErrorsStore();

  const sessions = ref<SyncLogSession[]>([]);
  const loading = ref(false);
  const error = ref<unknown>(null);

  async function reload(): Promise<void> {
    loading.value = true;
    try {
      // Pull every available session (server-side capped to last 100 by the writer's
      // trim on each finish). The Activity page does its own filter / sort / pagination
      // client-side over this list.
      const result = await api.get<{ data: SyncLogSession[] }>(`/items/${LOCALAZY_COLLECTIONS.syncLog}`, {
        params: {
          limit: -1,
          sort: '-started_at',
          // Resolve the m2o initiator_user → just the id (the Activity UI looks up
          // names via the Directus users store).
          fields: ['*'],
        },
      });
      sessions.value = result.data.data;
      error.value = null;
    } catch (e: unknown) {
      error.value = e;
      addDirectusError(e);
    } finally {
      loading.value = false;
    }
  }

  async function clearAll(): Promise<void> {
    // Directus' bulk delete needs the list of ids. Pull them and DELETE in one shot.
    try {
      const list = await api.get<{ data: Array<{ id: string }> }>(`/items/${LOCALAZY_COLLECTIONS.syncLog}`, {
        params: { limit: -1, fields: ['id'] },
      });
      const ids = list.data.data.map((row) => row.id);
      if (ids.length === 0) {
        sessions.value = [];
        return;
      }
      await api.delete(`/items/${LOCALAZY_COLLECTIONS.syncLog}`, { data: ids });
      sessions.value = [];
    } catch (e: unknown) {
      addDirectusError(e);
      throw e;
    }
  }

  async function getById(id: string): Promise<SyncLogSession | null> {
    try {
      const result = await api.get<{ data: SyncLogSession }>(`/items/${LOCALAZY_COLLECTIONS.syncLog}/${id}`);
      return result.data.data;
    } catch (e: unknown) {
      addDirectusError(e);
      return null;
    }
  }

  // Mirror the singleton stores' pattern: first reload fires once the installer flips
  // `installed` to true. `immediate: true` covers the case where the installer was
  // already done by the time this store is first used.
  watch(
    () => installer.installed,
    (done) => {
      if (done) void reload();
    },
    { immediate: true },
  );

  return { sessions, loading, error, reload, clearAll, getById };
});
