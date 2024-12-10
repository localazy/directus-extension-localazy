import { cloneDeep } from 'lodash';
import { ref } from 'vue';
import { defaultConfiguration } from '../data/default-configuration';
import { Configuration } from '../models/configuration';
import { EnabledField } from '../../../common/models/collections-data/content-transfer-setup';
import { EnabledFieldsService } from '../../../common/utilities/enabled-fields-service';
import { useHydrate } from './use-hydrate';

export const useInitSyncContainer = () => {
  const configuration = ref<Configuration>(defaultConfiguration());
  const enabledFields = ref<EnabledField[]>([]);
  const synchronizeTranslationStrings = ref(defaultConfiguration().content_transfer_setup.translation_strings);
  const {
    settings, localazyData, contentTransferSetup, hydrateDirectusData,
  } = useHydrate();

  hydrateDirectusData().then(() => {
    if (settings.value) {
      configuration.value.settings = cloneDeep(settings.value);
    }
    if (localazyData.value) {
      configuration.value.localazy_data = cloneDeep(localazyData.value);
    }
    if (contentTransferSetup.value) {
      try {
        enabledFields.value = EnabledFieldsService.parseFromDatabase(contentTransferSetup.value.enabled_fields);
        synchronizeTranslationStrings.value = contentTransferSetup.value.translation_strings;
      } catch (e) {
        enabledFields.value = [];
      }
      configuration.value.content_transfer_setup = cloneDeep(contentTransferSetup.value);
    }
  });

  return {
    configuration,
    enabledFields,
    synchronizeTranslationStrings,
  };
};
