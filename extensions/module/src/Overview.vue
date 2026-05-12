<template>
  <private-view title="Overview" icon="home">
    <template #headline>
      <v-breadcrumb :items="[{ name: 'Localazy', to: '/localazy' }]" />
    </template>

    <template #navigation>
      <Navigation />
    </template>
    <div v-if="hydrated && installed" class="panel page">
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
import { onBeforeMount } from 'vue';
import { storeToRefs } from 'pinia';
import Navigation from './components/Navigation.vue';
import ErrorsNotice from './components/ErrorsNotice.vue';
import ConfigNotice from './components/ConfigNotice.vue';
import ConnectionOverview from './components/Overview/ConnectionOverview.vue';
import ConnectionLanguages from './components/Overview/ConnectionLanguages.vue';
import { useLocalazySettingsStore } from './stores/localazy-settings-store';
import { useLocalazyConfigurationStatus } from './composables/use-localazy-configuration-status';
import { useLocalazyBoot } from './composables/use-localazy-boot';

const { data: settings } = storeToRefs(useLocalazySettingsStore());
const { hasIncompleteConfiguration } = useLocalazyConfigurationStatus();
const { installed, hydrated, localazyData, boot } = useLocalazyBoot();

onBeforeMount(() => {
  // Errors land in the errors store inside `boot()`; no need to await or handle here.
  void boot();
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

.overview-block {
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
