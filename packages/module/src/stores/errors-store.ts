import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { LocalazyError } from '@localazy/directus-common';
import { AnalyticsService } from '@localazy/directus-common';

type Errors = {
  localazy: {
    project: LocalazyError[];
    file: LocalazyError[];
    import: LocalazyError[];
    export: LocalazyError[];
  };
  directus: string[];
};

type CommonParams = {
  userId: string;
  orgId: string;
};

type AddLocalazyError = CommonParams & { type: keyof Errors['localazy'] };

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

  function addLocalazyError(error: unknown, data: AddLocalazyError) {
    const normalised =
      error instanceof LocalazyError ? error : new LocalazyError('unknown', error instanceof Error ? error.message : String(error), 0);
    errors.value.localazy[data.type].push(normalised);
    // Analytics is fire-and-forget; error tracking shouldn't itself fail and block the flow.
    void AnalyticsService.trackError({
      userId: data.userId,
      orgId: data.orgId,
      message: normalised.message,
      origin: 'Localazy',
      type: data.type,
      errorData: JSON.stringify(normalised, null, 2),
    });
  }

  type DirectusErrorPayload = {
    response?: {
      data?: {
        errors?: Array<{ message: string }>;
      };
    };
    message?: string;
  };

  function addDirectusError(error: unknown) {
    const e = error as DirectusErrorPayload;
    const firstApiError = e.response?.data?.errors?.[0];
    if (firstApiError?.message) {
      errors.value.directus.push(firstApiError.message);
    } else if (e.message) {
      errors.value.directus.push(e.message);
    } else {
      errors.value.directus.push('Unknown error');
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
    const { project, file, import: importErrors, export: exportErrors } = errors.value.localazy;
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
