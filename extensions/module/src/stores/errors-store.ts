import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { AxiosError } from 'axios';
import { LocalazyError } from '../../../common/models/localazy-error';
import { AnalyticsService } from '../../../common/services/analytics-service';

type Errors = {
  localazy: {
    project: LocalazyError[];
    file: LocalazyError[];
    import: LocalazyError[];
    export: LocalazyError[];
  }
  directus: string[]
};

type CommonParams = {
  userId: string;
  orgId: string;
};

type AddLocalazyError = CommonParams & {type: keyof Errors['localazy'] };

export const useErrorsStore = defineStore('errorsStore', () => {
  const errors = ref<Errors>({
    localazy: {
      project: [],
      file: [],
      import: [],
      export: [],
    },
    directus: [],
  });

  function addLocalazyError(error: LocalazyError, data: AddLocalazyError) {
    errors.value.localazy[data.type].push(error);
    AnalyticsService.trackError({
      userId: data.userId,
      orgId: data.orgId,
      message: error.message,
      origin: 'Localazy',
      type: data.type,
      errorData: JSON.stringify(error, null, 2),
    });
  }

  function addDirectusError(error: AxiosError) {
    const e: any = error;
    if (e.response?.data?.errors?.length) {
      errors.value.directus.push(e.response.data.errors[0].message);
    } else {
      errors.value.directus.push(e.message);
    }
  }

  function resetLocalazyErrors() {
    errors.value.localazy = {
      project: [],
      file: [],
      import: [],
      export: [],
    };
  }

  function clearDirectusError(index: number) {
    errors.value.directus.splice(index, 1);
  }

  const localazyErrors = computed(() => errors.value.localazy);
  const directusErrors = computed(() => errors.value.directus);

  const hasLocalazyErrors = computed(() => {
    const {
      project, file, import: importErrors, export: exportErrors,
    } = errors.value.localazy;
    return project.length > 0 || file.length > 0 || importErrors.length > 0 || exportErrors.length > 0;
  });

  const hasDirectusErrors = computed(() => errors.value.directus.length > 0);

  return {
    localazyErrors,
    directusErrors,
    hasLocalazyErrors,
    hasDirectusErrors,
    addLocalazyError,
    addDirectusError,
    resetLocalazyErrors,
    clearDirectusError,
  };
});
