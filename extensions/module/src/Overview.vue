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
    <div class="panel page" v-if="hydrated && hydratedDirectusData">
      <config-notice class="notice" :has-incomplete-configuration="hasIncompleteConfiguration" />
      <errors-notice class="notice" :localazy-data="localazyData" />

      <connection-overview class="overview-block" :localazy-data="localazyData" :settings="settings" />
      <connection-languages class="overview-block mt-8" :settings="settings" />

    </div>

    <div v-else class="hydrating">
      <v-progress-circular indeterminate lar />
    </div>

  </private-view>
</template>

<script lang="ts" setup>
import { storeToRefs } from 'pinia';
import Navigation from './components/Navigation.vue';
import { useLocalazyStore } from './stores/localazy-store';
import ErrorsNotice from './components/ErrorsNotice.vue';
import ConfigNotice from './components/ConfigNotice.vue';
import ConnectionOverview from './components/Overview/ConnectionOverview.vue';
import ConnectionLanguages from './components/Overview/ConnectionLanguages.vue';
import { useHydrate } from './composables/use-hydrate';

const {
  hydrateDirectusData, localazyData, hasIncompleteConfiguration, settings, hydratedDirectusData,
} = useHydrate();
const localazyStore = useLocalazyStore();
const { hydrated } = storeToRefs(localazyStore);

hydrateDirectusData().then(() => {
  localazyStore.hydrateLocalazyData({ localazyData });
});

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

.hydrating {
  display: flex;
  justify-content: center;
  margin-top: 48px;
}
</style>
