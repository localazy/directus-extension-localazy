<template>
  <private-view>
    <template #title-outer:prepend>
      <v-button class="header-icon" rounded disabled icon secondary>
        <v-icon name="settings" />
      </v-button>
    </template>

    <template #title>
      <h1 class="type-title">Additional Settings</h1>
    </template>

    <template #headline>
      <v-breadcrumb :items="[{ name: 'Localazy', to: '/localazy' }]" />
    </template>

    <template #actions>
      <v-button
        class="panel-button"
        @click="onSaveChanges"
        :disabled="!changesExist"
        :loading="hydrating || loading">Save changes
      </v-button>
    </template>

    <template #navigation>
      <Navigation />
    </template>
    <div class="panel page">
      <errors-notice class="errors-notice" />

      <advanced-settings-form
        v-if="settingsCollection"
        v-model:edits="settingsEdits"
        :collection="settingsCollection.collection"
      />

    </div>

  </private-view>
</template>

<script lang="ts" setup>
import {
  computed, ref, watch,
} from 'vue';
import {
  cloneDeep, isEqual, merge,
} from 'lodash';
import { storeToRefs } from 'pinia';
import { useStores } from '@directus/extensions-sdk';
import { Settings } from '../../common/models/collections-data/settings';
import AdvancedSettingsForm from './components/AdvancedSettings/AdvancedSettingsForm.vue';
import Navigation from './components/Navigation.vue';
import { useLocalazyStore } from './stores/localazy-store';
import { defaultConfiguration } from './data/default-configuration';
import ErrorsNotice from './components/ErrorsNotice.vue';
import { useDirectusApi } from './composables/use-directus-api';

type Configuration = {
  settings: Settings;
};

const configuration = ref<Configuration>(defaultConfiguration());
const settingsEdits = ref<Settings>(cloneDeep(configuration.value.settings));
const loading = ref(false);

const { useNotificationsStore } = useStores();
const notificationsStore = useNotificationsStore();
const { upsertDirectusItem } = useDirectusApi();
const localazyStore = useLocalazyStore();
const {
  hydrate,
} = localazyStore;
const {
  settingsCollection, settings, hydrating,
} = storeToRefs(localazyStore);

watch(
  localazyStore.$state,
  (state) => {
    configuration.value.settings = merge(configuration.value.settings, state.settings);
    settingsEdits.value = cloneDeep(configuration.value.settings);
  },
  { immediate: true, deep: true },
);

hydrate();

const changesExist = computed(() => !isEqual(settingsEdits.value, configuration.value.settings));

async function onSaveChanges() {
  loading.value = true;
  if (settingsCollection.value) {
    await upsertDirectusItem(settingsCollection.value.collection, settings.value, settingsEdits.value);
    configuration.value.settings = cloneDeep(settingsEdits.value);
    notificationsStore.add({
      title: 'Settings saved',
    });
    await hydrate({ force: true });
  }
  loading.value = false;
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
