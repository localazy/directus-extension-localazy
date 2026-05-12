<template>
  <private-view title="Project setup" icon="lan">
    <template #headline>
      <v-breadcrumb :items="[{ name: 'Localazy', to: '/localazy' }]" />
    </template>

    <template #actions>
      <v-button class="panel-button" :disabled="!changesExist" :loading="hydrating || saving" @click="onSaveChanges"
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
import { storeToRefs } from 'pinia';
import { useStores } from '@directus/extensions-sdk';
import ProjectSetupForm from './components/ProjectSetup/ProjectSetupForm.vue';
import Navigation from './components/Navigation.vue';
import { useLocalazyStore } from './stores/localazy-store';
import ErrorsNotice from './components/ErrorsNotice.vue';
import { useLocalazyInstallerStore, LOCALAZY_COLLECTIONS } from './stores/localazy-installer-store';
import { useLocalazySettingsStore } from './stores/localazy-settings-store';
import { useLocalazyConfigStore } from './stores/localazy-config-store';
import { useSingletonForm } from './composables/use-singleton-form';

const settingsCollectionName = LOCALAZY_COLLECTIONS.settings;

const installer = useLocalazyInstallerStore();
const { installed } = storeToRefs(installer);

const settingsStore = useLocalazySettingsStore();
const { data: localazyData } = storeToRefs(useLocalazyConfigStore());

const { edits: settingsEdits, changesExist, save: saveSettings, loading: saving } = useSingletonForm(settingsStore);

const { useNotificationsStore } = useStores();
const notificationsStore = useNotificationsStore();
const localazyStore = useLocalazyStore();
const { hydrateLocalazyData } = localazyStore;
const { hydrating, hydrated } = storeToRefs(localazyStore);

// Fire-and-forget at component setup; errors land in the errors store inside `run()`.
void installer.run().then(() => hydrateLocalazyData({ localazyData }));

async function onSaveChanges() {
  await saveSettings();
  notificationsStore.add({ title: 'Settings saved' });
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
