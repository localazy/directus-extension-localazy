import { ref, watch } from 'vue';
import { useApi } from '@directus/extensions-sdk';
import { useLocalazyInstallerStore } from '../stores/localazy-installer-store';
import { useErrorsStore } from '../stores/errors-store';

/**
 * Factory for the per-singleton stores (settings, config, transfer setup).
 *
 * Each Localazy collection is a singleton — exactly one row, accessed at
 * `/items/{collection}`. This factory wraps that endpoint with:
 *   - reactive `data` (merged with the caller-supplied defaults so consumers never
 *     observe `null`)
 *   - `loading` / `error` refs
 *   - `save(payload)` that PATCHes the singleton row and refreshes
 *   - `reload()` for the rare cases that need a manual refresh (e.g. after the user
 *     edits the same record via Directus' own admin while our module is open)
 *
 * The fetch is gated on the installer — until `installer.installed` is true, the
 * factory returns the defaults without hitting the network. This avoids racing against
 * `useLocalazyInstallerStore.run()` and 404ing on a not-yet-created collection.
 *
 * Why not Directus' `useItems`? It's built for paginated, filterable list reads with
 * race-control between collection switches. For a singleton you fetch once after boot
 * and PATCH on save, the manual axios call is simpler and matches our actual lifecycle.
 *
 * Usage: `defineStore('localazySettings', createSingletonStore(name, defaults))`.
 * Wrapping in a Pinia store gives us shared state across components, devtools, and a
 * stable identity — what would otherwise be module-level state in this factory.
 */
export function createSingletonStore<T extends Record<string, unknown>>(collectionName: string, defaults: T) {
  return () => {
    const installer = useLocalazyInstallerStore();
    const api = useApi();
    const { addDirectusError } = useErrorsStore();

    const data = ref<T>(defaults);
    const loading = ref(false);
    const error = ref<unknown>(null);

    async function reload(): Promise<void> {
      loading.value = true;
      try {
        const result = await api.get<{ data: Partial<T> }>(`/items/${collectionName}`);
        // Defaults filled in here, on read. We deliberately do NOT write the merged
        // result back to Directus — that's the "normalize on load" anti-pattern from
        // the old useHydrate that silently overrode user-set values matching defaults.
        data.value = { ...defaults, ...result.data.data } as T;
        error.value = null;
      } catch (e: unknown) {
        error.value = e;
        addDirectusError(e);
      } finally {
        loading.value = false;
      }
    }

    async function save(payload: Partial<T>): Promise<void> {
      try {
        await api.patch(`/items/${collectionName}`, payload);
        await reload();
      } catch (e: unknown) {
        addDirectusError(e);
        throw e;
      }
    }

    // First load fires when the installer finishes. `immediate: true` covers the case
    // where the installer has already completed by the time this store is first used
    // (e.g. user navigating between module pages after the first boot).
    watch(
      () => installer.installed,
      (done) => {
        if (done) void reload();
      },
      { immediate: true },
    );

    return { data, loading, error, save, reload };
  };
}
