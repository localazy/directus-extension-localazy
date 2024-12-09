import { useApi, useStores } from '@directus/extensions-sdk';
import { storeToRefs } from 'pinia';
import { ref, computed } from 'vue';
import {
  Item, AppCollection, Field,
} from '@directus/types';
import { isEqual, merge } from 'lodash';
import { createLocalazyDataFields } from '../data/fields/localazy-data/create';
import { ContentTransferSetupDatabase } from '../../../common/models/collections-data/content-transfer-setup';
import { Settings } from '../../../common/models/collections-data/settings';
import { LocalazyData } from '../../../common/models/collections-data/localazy-data';
import { createSettingsFields } from '../data/fields/settings/create';
import { createContentTransferSetupsFields } from '../data/fields/content-transfer-setup/create';
import { useErrorsStore } from '../stores/errors-store';
import { defaultConfiguration } from '../data/default-configuration';
import { sleep } from '../../../common/utilities/sleep';
import { getConfig } from '../../../common/config/get-config';

type HydrateOptions = {
  /** Force rehydration */
  force?: boolean;
};

type Options = {
  collections: {
    groupingFolder: string;
    settings: string;
    contentTransferSetup: string;
    localazyData: string;
  }
};

type Collection = AppCollection | null;

const defaultOptions: Options = {
  collections: {
    groupingFolder: 'localazy_data',
    settings: 'localazy_settings',
    contentTransferSetup: 'localazy_content_transfer_setup',
    localazyData: 'localazy_config_data',
  },
};

const settingsItem = ref<Item & Settings | null>(null);
const contentTransferSetupItem = ref<Item & ContentTransferSetupDatabase | null>(null);
const localazyDataItem = ref<Item & LocalazyData | null>(null);

export const useHydrate = () => {
  const hydratingDirectusData = ref(false);
  const hydratedDirectusData = ref(false);

  const {
    addDirectusError,
  } = useErrorsStore();

  const { useCollectionsStore, useFieldsStore } = useStores();
  const { getFieldsForCollection } = useFieldsStore();
  const { collections } = storeToRefs(useCollectionsStore());
  const directusApi = useApi();

  const settingsCollection = ref<Collection>(collections?.value
    .find((c: AppCollection) => c.collection === defaultOptions.collections.settings) || null);
  const localazyDataCollection = ref<Collection>(collections?.value
    .find((c: AppCollection) => c.collection === defaultOptions.collections.localazyData) || null);
  const contentTransferSetupCollection = ref<Collection>(collections?.value
    .find((c: AppCollection) => c.collection === defaultOptions.collections.contentTransferSetup) || null);

  const hasIncompleteConfiguration = computed(() => {
    if (!settingsItem.value) { return true; }
    if (!localazyDataItem.value) { return true; }
    const {
      source_language, language_code_field, language_collection,
    } = settingsItem.value;

    return !source_language || !localazyDataItem.value.access_token || !language_code_field || !language_collection;
  });

  async function createContentTransferSetupCollection(collection: string, group: string) {
    const contentCollection = await directusApi.post(
      '/collections',
      {
        collection,
        meta: {
          collection,
          icon: 'translate',
          note: 'Collection data for the Localazy plugin',
          group,
          hidden: getConfig().APP_MODE === 'production',
          singleton: true,
          archive_app_filter: true,
        },
        schema: {},
        fields: createContentTransferSetupsFields(),
      },
    );
    await sleep(100);
    await directusApi.patch(
      `/items/${collection}`,
      defaultConfiguration().content_transfer_setup,
    );
    return contentCollection;
  }

  async function resolveFolderCollection() {
    const createGroupingFolder = async (collection: string) => directusApi.post(
      '/collections',
      {
        collection,
        meta: {
          collection,
          icon: 'translate',
          note: 'Localazy grouping folder',
          hidden: getConfig().APP_MODE === 'production',
        },
        schema: null,
      },
    );

    const localazyFolderCollection = collections?.value
      .find((c: AppCollection) => c.collection === defaultOptions.collections.groupingFolder) || null;

    if (!localazyFolderCollection) {
      try {
        await createGroupingFolder(defaultOptions.collections.groupingFolder);
      } catch (e: any) {
        addDirectusError(e);
      }
    }
  }

  async function loadSettings(options: HydrateOptions) {
    const normalizeSettingsData = async (collection: string) => {
      const storedData = await directusApi.get(`/items/${collection}`);
      const allProperties = merge({}, defaultConfiguration().settings, storedData.data.data);
      const missingSomeProperties = !isEqual(allProperties, storedData.data.data);
      if (missingSomeProperties) {
        await directusApi.patch(
          `/items/${collection}`,
          allProperties,
        );
      }
    };

    const settingsCollectionName = settingsCollection.value?.collection || '';

    if (!settingsItem.value || options.force) {
      try {
        const settingsItems = await directusApi.get(`/items/${settingsCollectionName}`, {
          params: {
            fields: '*',
            limit: 1,
          },
        });
        settingsItem.value = settingsItems.data.data || null;
      } catch (e: any) {
        addDirectusError(e);
      }
    }

    try {
      await normalizeSettingsData(settingsCollectionName);
    } catch (e: any) {
      addDirectusError(e);
    }
  }

  async function normalizeContentTransferData(collection: string) {
    const storedData = await directusApi.get(`/items/${collection}`);
    const allProperties = merge({}, defaultConfiguration().content_transfer_setup, storedData.data.data);
    const missingSomeProperties = !isEqual(allProperties, storedData.data.data);
    if (missingSomeProperties) {
      await directusApi.patch(
        `/items/${collection}`,
        allProperties,
      );
      contentTransferSetupItem.value = allProperties;
    }
  }

  async function resolveContentTransferSetupCollection() {
    const normalizeContentTransferDataCollection = async (collection: string) => {
      const missingFields = createContentTransferSetupsFields().filter((field) => {
        const existingField = getFieldsForCollection(collection).find((f: Field) => f.field === field.field);
        return !existingField;
      });

      missingFields.forEach(async (field) => {
        await directusApi.post(`/fields/${collection}`, field);
      });
    };

    if (!contentTransferSetupCollection.value) {
      try {
        const result = await createContentTransferSetupCollection(
          defaultOptions.collections.contentTransferSetup,
          defaultOptions.collections.groupingFolder,
        );
        contentTransferSetupCollection.value = result.data.data;
      } catch (e: any) {
        addDirectusError(e);
      }
    } else {
      try {
        await normalizeContentTransferDataCollection(defaultOptions.collections.contentTransferSetup);
      } catch (e: any) {
        addDirectusError(e);
      }
    }
  }

  async function createSettingsCollection(collection: string, group: string) {
    const newSettingsCollection = await directusApi.post(
      '/collections',
      {
        collection,
        meta: {
          collection,
          icon: 'translate',
          note: 'Collection data for the Localazy plugin',
          group,
          hidden: getConfig().APP_MODE === 'production',
          singleton: true,
          archive_app_filter: true,
        },
        schema: {},
        fields: createSettingsFields(),
      },
    );
    await sleep(100);
    await directusApi.patch(
      `/items/${collection}`,
      defaultConfiguration().settings,
    );

    return newSettingsCollection;
  }

  async function createLocalazyDataCollection(collection: string, group: string) {
    const contentCollection = await directusApi.post(
      '/collections',
      {
        collection,
        meta: {
          collection,
          icon: 'translate',
          note: 'Collection data for the Localazy plugin',
          group,
          hidden: getConfig().APP_MODE === 'production',
          singleton: true,
          archive_app_filter: true,
        },
        schema: {},
        fields: createLocalazyDataFields(),
      },
    );
    await sleep(100);
    await directusApi.patch(
      `/items/${collection}`,
      defaultConfiguration().localazy_data,
    );
    return contentCollection;
  }

  async function normalizeSettingsCollection(collection: string) {
    const missingFields = createSettingsFields().filter((field) => {
      const existingField = getFieldsForCollection(collection).find((f: Field) => f.field === field.field);
      return !existingField;
    });

    missingFields.forEach(async (field) => {
      await directusApi.post(`/fields/${collection}`, field);
    });
  }

  async function resolveSettingsCollection() {
    if (!settingsCollection.value) {
      try {
        const result = await createSettingsCollection(defaultOptions.collections.settings, defaultOptions.collections.groupingFolder);
        settingsCollection.value = result.data.data;
      } catch (e: any) {
        addDirectusError(e);
      }
    } else {
      try {
        await normalizeSettingsCollection(defaultOptions.collections.settings);
      } catch (e: any) {
        addDirectusError(e);
      }
    }
  }

  async function resolveLocalazyDataCollection() {
    const normalizeLocalazyDataCollection = async (collection: string) => {
      const missingFields = createLocalazyDataFields().filter((field) => {
        const existingField = getFieldsForCollection(collection).find((f: Field) => f.field === field.field);
        return !existingField;
      });

      missingFields.forEach(async (field) => {
        await directusApi.post(`/fields/${collection}`, field);
      });
    };

    if (!localazyDataCollection.value) {
      try {
        const result = await createLocalazyDataCollection(
          defaultOptions.collections.localazyData,
          defaultOptions.collections.groupingFolder,
        );
        localazyDataCollection.value = result.data.data;
      } catch (e: any) {
        addDirectusError(e);
      }
    } else {
      try {
        await normalizeLocalazyDataCollection(defaultOptions.collections.localazyData);
      } catch (e: any) {
        addDirectusError(e);
      }
    }
  }

  async function loadLocalazyDataCollection(options: HydrateOptions) {
    const localazyDataCollectionName = localazyDataCollection.value?.collection || '';
    if (!localazyDataItem.value || options.force) {
      try {
        const result = await directusApi.get(`/items/${localazyDataCollectionName}`, {
          params: {
            fields: '*',
            limit: 1,
          },
        });
        localazyDataItem.value = result.data.data || null;
      } catch (e: any) {
        addDirectusError(e);
      }
    }

    const normalizeLocalazyData = async (collection: string) => {
      const storedData = await directusApi.get(`/items/${collection}`);
      const allProperties = merge({}, defaultConfiguration().localazy_data, storedData.data.data);
      const missingSomeProperties = !isEqual(allProperties, storedData.data.data);
      if (missingSomeProperties) {
        await directusApi.patch(
          `/items/${collection}`,
          allProperties,
        );
        localazyDataItem.value = allProperties;
      }
    };

    try {
      await normalizeLocalazyData(localazyDataCollectionName);
    } catch (e: any) {
      addDirectusError(e);
    }
  }

  async function loadContentTransferSetup(options: HydrateOptions) {
    const contentTransferSetupCollectionName = contentTransferSetupCollection.value?.collection || '';
    if (!contentTransferSetupItem.value || options.force) {
      try {
        const contentTransferSetupItems = await directusApi.get(`/items/${contentTransferSetupCollectionName}`, {
          params: {
            fields: '*',
            limit: 1,
          },
        });
        contentTransferSetupItem.value = contentTransferSetupItems.data.data || null;
      } catch (e: any) {
        addDirectusError(e);
      }
    }

    try {
      await normalizeContentTransferData(contentTransferSetupCollectionName);
    } catch (e: any) {
      addDirectusError(e);
    }
  }

  async function hydrateDirectusData(options: HydrateOptions = {}) {
    if (hydratingDirectusData.value) return;

    hydratingDirectusData.value = true;
    await Promise.all([
      resolveFolderCollection(),
      resolveSettingsCollection(),
      resolveContentTransferSetupCollection(),
      resolveLocalazyDataCollection(),
    ]);

    await Promise.all([
      loadSettings(options),
      loadContentTransferSetup(options),
      loadLocalazyDataCollection(options),
    ]);

    hydratedDirectusData.value = true;
    hydratingDirectusData.value = false;
  }

  return {
    hydrateDirectusData,
    hasIncompleteConfiguration,
    hydratingDirectusData,
    hydratedDirectusData,
    settings: settingsItem,
    contentTransferSetup: contentTransferSetupItem,
    contentTransferSetupCollection,
    localazyData: localazyDataItem,
    settingsCollection,
    localazyDataCollection,
  };
};
