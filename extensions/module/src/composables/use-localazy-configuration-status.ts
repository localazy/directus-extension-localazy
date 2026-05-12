import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useLocalazySettingsStore } from '../stores/localazy-settings-store';
import { useLocalazyConfigStore } from '../stores/localazy-config-store';

/**
 * Whether the user has completed the minimum configuration for the module to work:
 * Localazy access token + Directus language collection wiring.
 *
 * Replaces the `hasIncompleteConfiguration` computed that previously lived inside
 * `useHydrate`, now derived directly from the per-singleton stores.
 */
export const useLocalazyConfigurationStatus = () => {
  const { data: settings } = storeToRefs(useLocalazySettingsStore());
  const { data: config } = storeToRefs(useLocalazyConfigStore());

  const hasIncompleteConfiguration = computed(() => {
    const { source_language, language_code_field, language_collection } = settings.value;
    return !source_language || !config.value.access_token || !language_code_field || !language_collection;
  });

  return { hasIncompleteConfiguration };
};
