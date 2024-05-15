import { defineStore, storeToRefs } from 'pinia';
import { Project, File } from '@localazy/api-client';
import { computed, ref } from 'vue';
import { useApi, useStores } from '@directus/extensions-sdk';
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
import { useErrorsStore } from './errors-store';
import { AnalyticsService } from '../../../common/services/analytics-service';
import { defaultConfiguration } from '../data/default-configuration';
import { LocalazyApiThrottleService } from '../../../common/services/localazy-api-throttle-service';
import { sleep } from '../../../common/utilities/sleep';
import { LocalazyPaymentStatus } from '../../../common/utilities/localazy-payment-status';

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

export const useLocalazyStore = defineStore('localazyStore', () => {
  const localazyProject = ref<Project | null>(null);
  const directusFile = ref<File | null>(null);
  const hydrating = ref(false);
  const hydrated = ref(false);
  const {
    addLocalazyError, addDirectusError, resetLocalazyErrors,
  } = useErrorsStore();

  const projectId = computed(() => localazyProject.value?.id || '');
  const exceededKeyLimit = computed(() => LocalazyPaymentStatus.isOverKeysLimit(localazyProject.value));
  const lacksAccessToPlugin = computed(() => LocalazyPaymentStatus.lacksAccessToPlugin(localazyProject.value));
  const shouldDisableSyncOperations = computed(() => LocalazyPaymentStatus.shouldDisableSyncOperations(localazyProject.value));

  const { useCollectionsStore, useFieldsStore } = useStores();
  const { getFieldsForCollection } = useFieldsStore();
  const { collections } = storeToRefs(useCollectionsStore());
  const directusApi = useApi();

  const settingsItem = ref<Item & Settings | null>(null);
  const contentTransferSetupItem = ref<Item & ContentTransferSetupDatabase | null>(null);
  const localazyDataItem = ref<Item & LocalazyData | null>(null);

  const localazyFolderCollection = ref<Collection>(collections?.value
    .find((c: AppCollection) => c.collection === defaultOptions.collections.groupingFolder) || null);
  const settingsCollection = ref<Collection>(collections?.value
    .find((c: AppCollection) => c.collection === defaultOptions.collections.settings) || null);
  const contentTransferSetupCollection = ref<Collection>(collections?.value
    .find((c: AppCollection) => c.collection === defaultOptions.collections.contentTransferSetup) || null);
  const localazyDataCollection = ref<Collection>(collections?.value
    .find((c: AppCollection) => c.collection === defaultOptions.collections.localazyData) || null);

  const hasIncompleteConfiguration = computed(() => {
    if (!settingsItem.value) { return true; }
    if (!localazyDataItem.value) { return true; }
    const {
      source_language, language_code_field, language_collection,
    } = settingsItem.value;

    return !source_language || !localazyDataItem.value.access_token || !language_code_field || !language_collection;
  });

  const localazyUser = computed(() => ({
    id: localazyDataItem.value?.user_id || '',
    name: localazyDataItem.value?.user_name || '',
  }));

  async function createGroupingFolder(collection: string) {
    return directusApi.post(
      '/collections',
      {
        collection,
        meta: {
          collection,
          icon: 'translate',
          note: 'Localazy grouping folder',
          hidden: true,
        },
        schema: null,
      },
    );
  }

  async function normalizeSettingsData(collection: string) {
    const storedData = await directusApi.get(`/items/${collection}`);
    const allProperties = merge({}, defaultConfiguration().settings, storedData.data.data);
    const missingSomeProperties = !isEqual(allProperties, storedData.data.data);
    if (missingSomeProperties) {
      await directusApi.patch(
        `/items/${collection}`,
        allProperties,
      );
      settingsItem.value = allProperties;
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

  async function normalizeLocalazyData(collection: string) {
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
          hidden: true,
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
          hidden: true,
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
          hidden: true,
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

  async function normalizeContentTransferDataCollection(collection: string) {
    const missingFields = createContentTransferSetupsFields().filter((field) => {
      const existingField = getFieldsForCollection(collection).find((f: Field) => f.field === field.field);
      return !existingField;
    });

    missingFields.forEach(async (field) => {
      await directusApi.post(`/fields/${collection}`, field);
    });
  }

  async function normalizeLocalazyDataCollection(collection: string) {
    const missingFields = createLocalazyDataFields().filter((field) => {
      const existingField = getFieldsForCollection(collection).find((f: Field) => f.field === field.field);
      return !existingField;
    });

    missingFields.forEach(async (field) => {
      await directusApi.post(`/fields/${collection}`, field);
    });
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

  async function loadSettings(options: HydrateOptions) {
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

  async function resolveFolderCollection() {
    if (!localazyFolderCollection.value) {
      try {
        const result = await createGroupingFolder(defaultOptions.collections.groupingFolder);
        localazyFolderCollection.value = result.data.data;
      } catch (e: any) {
        addDirectusError(e);
      }
    }
  }

  async function resolveSettingsCollection() {
    if (!settingsCollection.value) {
      try {
        const result = await createSettingsCollection(defaultOptions.collections.settings, defaultOptions.collections.groupingFolder);
        settingsCollection.value = result.data.data;
      } catch (e: any) {
        addDirectusError(e);
      }
    }
    try {
      await normalizeSettingsCollection(defaultOptions.collections.settings);
    } catch (e: any) {
      addDirectusError(e);
    }
  }

  async function resolveContentTransferSetupCollection() {
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
    }
    try {
      await normalizeContentTransferDataCollection(defaultOptions.collections.contentTransferSetup);
    } catch (e: any) {
      addDirectusError(e);
    }
  }

  async function resolveLocalazyDataCollection() {
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
    }
    try {
      await normalizeLocalazyDataCollection(defaultOptions.collections.localazyData);
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

    try {
      await normalizeLocalazyData(localazyDataCollectionName);
    } catch (e: any) {
      addDirectusError(e);
    }
  }

  async function loadProject(options: HydrateOptions) {
    const token = localazyDataItem.value?.access_token;
    if (!localazyProject.value || options.force) {
      if (token) {
        try {
          const projects = await LocalazyApiThrottleService.listProjects(token, { organization: true, languages: true });
          localazyProject.value = projects[0] || null;
          resetLocalazyErrors();
          AnalyticsService.trackConnectedProject({
            orgId: localazyProject.value?.orgId || '',
            userId: localazyDataItem.value?.user_id || '',
            name: localazyProject.value?.name || '',
            slug: localazyProject.value?.slug || '',
          });
        } catch (e: any) {
          addLocalazyError(e, {
            type: 'project', userId: localazyDataItem.value?.user_id || '', orgId: localazyDataItem.value?.org_id || '',
          });
        }
      } else {
        localazyProject.value = null;
        resetLocalazyErrors();
      }
    }
  }

  async function loadFile(options: HydrateOptions) {
    const token = localazyDataItem.value?.access_token;
    if (projectId.value && (!directusFile.value || options.force)) {
      if (token) {
        try {
          const files = await LocalazyApiThrottleService.listFiles(token, {
            project: projectId.value,
          });
          directusFile.value = files.find((file) => file.name === 'directus.json') || null;
          resetLocalazyErrors();
        } catch (e: any) {
          addLocalazyError(e, {
            type: 'file', userId: localazyDataItem.value?.user_id || '', orgId: localazyDataItem.value?.org_id || '',
          });
        }
      } else {
        directusFile.value = null;
        resetLocalazyErrors();
      }
    }
  }

  async function hydrate(options: HydrateOptions = {}) {
    if (hydrating.value) return;

    hydrating.value = true;
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

    await Promise.all([
      loadProject(options),
    ]);

    await Promise.all([
      loadFile(options),
    ]);

    hydrated.value = true;
    hydrating.value = false;
  }

  return {
    hydrate,
    localazyProject,
    hasIncompleteConfiguration,
    projectId,
    localazyUser,
    directusFile,
    hydrating,
    hydrated,
    settings: settingsItem,
    contentTransferSetup: contentTransferSetupItem,
    contentTransferSetupCollection,
    localazyData: localazyDataItem,
    localazyDataCollection,
    settingsCollection,
    exceededKeyLimit,
    lacksAccessToPlugin,
    shouldDisableSyncOperations,
  };
});
