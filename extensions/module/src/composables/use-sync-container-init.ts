import { ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { EnabledField } from '../../../common/models/collections-data/content-transfer-setup';
import { EnabledFieldsService } from '../../../common/utilities/enabled-fields-service';
import { defaultConfiguration } from '../data/default-configuration';
import { useLocalazyInstallerStore } from '../stores/localazy-installer-store';
import { useLocalazyTransferSetupStore } from '../stores/localazy-transfer-setup-store';

/**
 * Owns the editable sync-container state that lives across `Sync.vue`:
 *   - `enabledFields` — parsed from the transfer-setup row, edited in the UI before save
 *   - `synchronizeTranslationStrings` — boolean toggle, also edited before save
 *
 * The source of truth is the transfer-setup store; this composable seeds the editable
 * refs from it on first install and on subsequent saves.
 */
export const useInitSyncContainer = () => {
  const installer = useLocalazyInstallerStore();
  const transferSetupStore = useLocalazyTransferSetupStore();
  const { data: transferSetup } = storeToRefs(transferSetupStore);

  const enabledFields = ref<EnabledField[]>([]);
  const synchronizeTranslationStrings = ref(defaultConfiguration().content_transfer_setup.translation_strings);

  // Boot the installer fire-and-forget; errors land in the errors store inside `run()`.
  void installer.run();

  // Seed editable state from the transfer-setup store whenever it changes (initial
  // load, post-save reload, or rare cases like another tab saving the same record).
  watch(
    transferSetup,
    (setup) => {
      try {
        enabledFields.value = EnabledFieldsService.parseFromDatabase(setup.enabled_fields);
      } catch {
        enabledFields.value = [];
      }
      synchronizeTranslationStrings.value = setup.translation_strings;
    },
    { immediate: true, deep: true },
  );

  return {
    enabledFields,
    synchronizeTranslationStrings,
  };
};
