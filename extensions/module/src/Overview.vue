<template>
  <private-view>
    <template #title-outer:prepend>
      <v-button class="header-icon" rounded disabled icon secondary>
        <v-icon name="home" />
      </v-button>
    </template>

    <template #headline>
      <v-breadcrumb :items="[{ name: 'Localazy', to: '/localazy' }]" />
    </template>

    <template #title>
      <h1 class="type-title">Overview</h1>
    </template>

    <template #navigation>
      <Navigation />
    </template>
    <div class="panel page">
      <config-notice class="notice" />
      <errors-notice class="notice" />

      <connection-overview class="overview-block" />
      <connection-languages class="overview-block mt-8" />

    </div>

  </private-view>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue';
import { cloneDeep, merge } from 'lodash';
import { Settings } from '../../common/models/collections-data/settings';
import Navigation from './components/Navigation.vue';
import { useLocalazyStore } from './stores/localazy-store';
import { defaultConfiguration } from './data/default-configuration';
import ErrorsNotice from './components/ErrorsNotice.vue';
import ConfigNotice from './components/ConfigNotice.vue';

import ConnectionOverview from './components/Overview/ConnectionOverview.vue';
import ConnectionLanguages from './components/Overview/ConnectionLanguages.vue';

type Configuration = {
  settings: Settings;
};

const configuration = ref<Configuration>(defaultConfiguration());
const settingsEdits = ref<Settings>(cloneDeep(configuration.value.settings));

const localazyStore = useLocalazyStore();
const {
  hydrate,
} = localazyStore;

watch(
  localazyStore.$state,
  (state) => {
    configuration.value.settings = merge(configuration.value.settings, state.settings);
    settingsEdits.value = cloneDeep(configuration.value.settings);
  },
  { immediate: true, deep: true },
);

hydrate();

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

.overview-block{
  background-color: var(--background-normal);
  padding: 1rem;
}

.notice {
  margin-top: 20px;
  margin-bottom: 20px;
}

.mt-8 {
  margin-top: 1rem;
}
</style>
