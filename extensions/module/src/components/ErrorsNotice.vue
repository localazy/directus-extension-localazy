<template>
  <div>
    <v-notice type="danger" v-if="hasLocalazyErrors">
      <div class="message">
        <div>
          <h2>{{ title }}</h2>
          <div>{{ helpMessage }}</div>
        </div>

        <v-button
          v-if="currentError.type === 'project'"
          small
          @click="onReconnect"
          :loading="hydrating">Reconnect to Localazy
        </v-button>
      </div>
    </v-notice>
    <v-notice type="danger" v-if="hasDirectusErrors">
      <div class="messages">
        <div v-for="(directusError, index) in directusErrors" :key="index" class="message">
          <div>
            {{ directusError }}
          </div>
          <v-icon name="clear" clickable @click="clearDirectusError(index)" />
        </div>
      </div>
    </v-notice>
  </div>
</template>

<script lang="ts" setup>
import { storeToRefs } from 'pinia';
import { computed } from 'vue';
import { useErrorsStore } from '../stores/errors-store';
import { useLocalazyStore } from '../stores/localazy-store';

const {
  localazyErrors, directusErrors, hasLocalazyErrors, hasDirectusErrors,
} = storeToRefs(useErrorsStore());
const { clearDirectusError } = useErrorsStore();
const { hydrate } = useLocalazyStore();
const { hydrating } = storeToRefs(useLocalazyStore());

const currentError = computed(() => {
  const {
    project, file, import: importErrors, export: exportErrors,
  } = localazyErrors.value;

  if (project.length > 0) {
    return {
      type: 'project',
      error: project[0],
    };
  }
  if (file.length > 0) {
    return {
      type: 'file',
      error: file[0],
    };
  }
  if (importErrors.length > 0) {
    return {
      type: 'import',
      error: importErrors[0],
    };
  }
  if (exportErrors.length > 0) {
    return {
      type: 'export',
      error: exportErrors[0],
    };
  }
  return {
    type: 'none',
    error: null,
  };
});

const title = computed(() => {
  const { type } = currentError.value;
  switch (type) {
    case 'project':
      return 'Could not connect to Localazy project.';
    case 'file':
      return 'Could retrieve resources from Localazy.';
    case 'import':
      return 'Could not import translation.';
    case 'export':
      return 'Could not export translations.';
    default:
      return 'Unknown error.';
  }
});

const helpMessage = computed(() => {
  const { error } = currentError.value;
  if (error?.code === 401) {
    return 'Please verify your Localazy token is up-to-date.';
  }
  return 'Please contact us at team@localazy.com for help.';
});

async function onReconnect() {
  await hydrate({ force: true });
}

</script>

<style scoped lang="scss">
  .messages {
    display: flex;
    flex-direction: column;
    width: 100%;
    gap: 8px;
  }

  .message {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
  }

</style>
