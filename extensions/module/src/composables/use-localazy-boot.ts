import { storeToRefs } from 'pinia';
import { useLocalazyInstallerStore } from '../stores/localazy-installer-store';
import { useLocalazyConfigStore } from '../stores/localazy-config-store';
import { useLocalazyStore } from '../stores/localazy-store';

/**
 * The boot sequence every Localazy module view runs at setup:
 *   1. `installer.run()` — idempotent install/heal of the Localazy collections
 *   2. `localazyStore.hydrateLocalazyData()` — load the Localazy API state (project + file)
 *      using the config row that the installer guaranteed exists
 *
 * Both steps are individually idempotent (the installer single-flights via `runPromise`,
 * the localazy store guards on `hydrating`) so calling `boot()` on multiple views is safe.
 *
 * Returns the reactive flags the views need to gate UI on (`installed`, `hydrating`,
 * `hydrated`) plus the localazy config record (`localazyData`) consumed by ErrorsNotice
 * and the connection-overview blocks. Side effects don't fire on setup — call `boot()`
 * yourself, typically in `onBeforeMount(() => void boot())`.
 */
export const useLocalazyBoot = () => {
  const installer = useLocalazyInstallerStore();
  const { installed } = storeToRefs(installer);
  const configStore = useLocalazyConfigStore();
  const { data: localazyData } = storeToRefs(configStore);
  const localazyStore = useLocalazyStore();
  const { hydrating, hydrated } = storeToRefs(localazyStore);

  async function boot(): Promise<void> {
    await installer.run();
    // Wait for the config singleton's first reload to settle. Without this the
    // hydrate below reads stale defaults (no access_token) on a hard refresh,
    // which renders the Overview as "Not connected to Localazy" until the user
    // navigates away and back.
    await configStore.firstLoad;
    await localazyStore.hydrateLocalazyData({ localazyData });
  }

  return {
    installed,
    hydrating,
    hydrated,
    localazyData,
    boot,
  };
};
