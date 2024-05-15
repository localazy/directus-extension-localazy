import { cloneDeep } from 'lodash';
import { ref, watch, nextTick } from 'vue';
import { useLocalazyStore } from '../stores/localazy-store';
import { defaultConfiguration } from '../data/default-configuration';
import { Configuration } from '../models/configuration';
import { EnabledField } from '../../../common/models/collections-data/content-transfer-setup';
import { EnabledFieldsService } from '../../../common/utilities/enabled-fields-service';

export const useInitSyncContainer = () => {
  const localazyStore = useLocalazyStore();
  const {
    hydrate,
  } = localazyStore;

  const configuration = ref<Configuration>(defaultConfiguration());
  const enabledFields = ref<EnabledField[]>([]);
  const synchronizeTranslationStrings = ref(defaultConfiguration().content_transfer_setup.translation_strings);

  const stopWatcher = watch(
    localazyStore.$state,
    (state) => {
      if (state.settings) {
        configuration.value.settings = cloneDeep(state.settings);
      }
      if (state.localazyData) {
        configuration.value.localazy_data = cloneDeep(state.localazyData);
      }
      if (state.contentTransferSetup) {
        try {
          enabledFields.value = EnabledFieldsService.parseFromDatabase(state.contentTransferSetup.enabled_fields);
          synchronizeTranslationStrings.value = state.contentTransferSetup.translation_strings;
        } catch (e) {
          enabledFields.value = [];
        }
        configuration.value.content_transfer_setup = cloneDeep(state.contentTransferSetup);
      }
      if (state.settings && state.contentTransferSetup) {
        nextTick().then(() => {
          stopWatcher();
        });
      }
    },
    { immediate: true, deep: true },
  );

  hydrate();

  return {
    configuration,
    enabledFields,
    synchronizeTranslationStrings,
  };
};
