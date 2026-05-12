<template>
  <private-view title="Project setup" icon="lan">
    <template #headline>
      <v-breadcrumb :items="[{ name: 'Localazy', to: '/localazy' }]" />
    </template>

    <template #actions>
      <v-button class="panel-button" :disabled="!changesExist" :loading="hydrating || loading" @click="onSaveChanges"
        >Save changes
      </v-button>
    </template>

    <template #navigation>
      <Navigation />
    </template>
    <div v-if="hydrated && installed" class="panel page">
      <errors-notice class="errors-notice" :localazy-data="localazyData" />
      <project-setup-form v-model:edits="settingsEdits" :collection="settingsCollectionName" />
    </div>
  </private-view>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import { cloneDeep, isEqual } from 'lodash';
import { storeToRefs } from 'pinia';
import { useStores } from '@directus/extensions-sdk';
import { Settings } from '../../common/models/collections-data/settings';
import ProjectSetupForm from './components/ProjectSetup/ProjectSetupForm.vue';
import Navigation from './components/Navigation.vue';
import { useLocalazyStore } from './stores/localazy-store';
import ErrorsNotice from './components/ErrorsNotice.vue';
import { useLocalazyInstallerStore, LOCALAZY_COLLECTIONS } from './stores/localazy-installer-store';
import { useLocalazySettingsStore } from './stores/localazy-settings-store';
import { useLocalazyConfigStore } from './stores/localazy-config-store';

const settingsCollectionName = LOCALAZY_COLLECTIONS.settings;

const installer = useLocalazyInstallerStore();
const { installed } = storeToRefs(installer);

const settingsStore = useLocalazySettingsStore();
const { data: settings } = storeToRefs(settingsStore);
const { data: localazyData } = storeToRefs(useLocalazyConfigStore());

const settingsEdits = ref<Settings>(cloneDeep(settings.value));
const loading = ref(false);

const { useNotificationsStore } = useStores();
const notificationsStore = useNotificationsStore();
const localazyStore = useLocalazyStore();
const { hydrateLocalazyData } = localazyStore;
const { hydrating, hydrated } = storeToRefs(localazyStore);

// The login/logout buttons write to the Localazy config store directly, so we don't
// need an `edits` ref for localazyData here — only for the settings form. Reseat the
// settings edits when the underlying source changes (install finishes, save reloads).
watch(
  settings,
  (s) => {
    settingsEdits.value = cloneDeep(s);
  },
  { immediate: true, deep: true },
);

// Fire-and-forget at component setup; errors land in the errors store inside `run()`.
void installer.run().then(() => hydrateLocalazyData({ localazyData }));

const changesExist = computed(() => !isEqual(settingsEdits.value, settings.value));

async function onSaveChanges() {
  loading.value = true;
  try {
    await settingsStore.save(settingsEdits.value);
    notificationsStore.add({ title: 'Settings saved' });
  } finally {
    loading.value = false;
  }
}
</script>

<style lang="scss" scoped>
@import './styles/mixins/page';

.page {
  @include page;
}

.panel {
  padding: var(--content-padding);
  padding-top: 0;
  padding-bottom: var(--content-padding-bottom);
}

.panel-button {
  margin-top: 20px;
}

.errors-notice {
  margin-bottom: 16px;
}
</style>
