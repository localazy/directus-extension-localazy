import { defineStore } from 'pinia';
import { Project, File } from '@localazy/api-client';
import {
  computed, MaybeRef, ref, toValue,
} from 'vue';
import { LocalazyData } from '../../../common/models/collections-data/localazy-data';
import { useErrorsStore } from './errors-store';
import { AnalyticsService } from '../../../common/services/analytics-service';
import { LocalazyApiThrottleService } from '../../../common/services/localazy-api-throttle-service';
import { LocalazyPaymentStatus } from '../../../common/utilities/localazy-payment-status';

type HydrateOptions = {
  /** Force rehydration */
  force?: boolean;
  localazyData: MaybeRef<LocalazyData | null>;
};

export const useLocalazyStore = defineStore('localazyStore', () => {
  const localazyProject = ref<Project | null>(null);
  const directusFile = ref<File | null>(null);
  const hydrating = ref(false);
  const hydrated = ref(false);
  const {
    addLocalazyError, resetLocalazyErrors,
  } = useErrorsStore();

  const projectId = computed(() => localazyProject.value?.id || '');
  const exceededKeyLimit = computed(() => LocalazyPaymentStatus.isOverKeysLimit(localazyProject.value));
  const lacksAccessToPlugin = computed(() => LocalazyPaymentStatus.lacksAccessToPlugin(localazyProject.value));
  const shouldDisableSyncOperations = computed(() => LocalazyPaymentStatus.shouldDisableSyncOperations(localazyProject.value));

  const localazyDataItem = ref<LocalazyData | null>(null);

  const localazyUser = computed(() => ({
    id: localazyDataItem.value?.user_id || '',
    name: localazyDataItem.value?.user_name || '',
  }));

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

  async function hydrateLocalazyData(options: HydrateOptions) {
    localazyDataItem.value = toValue(options.localazyData);
    if (hydrating.value) return;

    hydrating.value = true;
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
    hydrated,
    hydrating,
    hydrateLocalazyData,
    localazyProject,
    projectId,
    localazyUser,
    directusFile,
    exceededKeyLimit,
    lacksAccessToPlugin,
    shouldDisableSyncOperations,
  };
});
