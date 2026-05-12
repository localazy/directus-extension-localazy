<template>
  <private-view title="Additional Settings" icon="settings">
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

      <advanced-settings-form v-model:edits="settingsEdits" :collection="settingsCollectionName" />
    </div>
  </private-view>
</template>

<script lang="ts" setup>
import { onBeforeMount } from 'vue';
import AdvancedSettingsForm from './components/AdvancedSettings/AdvancedSettingsForm.vue';
import Navigation from './components/Navigation.vue';
import ErrorsNotice from './components/ErrorsNotice.vue';
import { LOCALAZY_COLLECTIONS } from './stores/localazy-installer-store';
import { useLocalazySettingsStore } from './stores/localazy-settings-store';
import { useSingletonForm } from './composables/use-singleton-form';
import { useLocalazyBoot } from './composables/use-localazy-boot';
import { useDirectusNotificationsStore } from './composables/use-directus-stores';

const settingsCollectionName = LOCALAZY_COLLECTIONS.settings;

const settingsStore = useLocalazySettingsStore();
const { edits: settingsEdits, changesExist, save: saveSettings, loading: saving } = useSingletonForm(settingsStore);

const notificationsStore = useDirectusNotificationsStore();
const { installed, hydrating, hydrated, localazyData, boot } = useLocalazyBoot();

onBeforeMount(() => {
  // Errors land in the errors store inside `boot()`; no need to await or handle here.
  void boot();
});

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
