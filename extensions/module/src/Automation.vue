<template>
  <private-view title="Automation" icon="cloud_sync">
    <template #headline>
      <v-breadcrumb :items="[{ name: 'Localazy', to: '/localazy' }]" />
    </template>

    <template #actions>
      <v-button
        v-if="bundleStatus.installed.value && hydrated && installed"
        class="panel-button"
        :disabled="!changesExist"
        :loading="saving"
        @click="onSaveChanges"
      >
        Save changes
      </v-button>
    </template>

    <template #navigation>
      <Navigation />
    </template>

    <div class="panel page">
      <errors-notice class="errors-notice" :localazy-data="localazyData" />

      <div v-if="bundleStatus.loading.value" class="status-line">
        <v-progress-circular indeterminate small />
        <span>Checking automation bundle…</span>
      </div>

      <!-- State A: bundle not installed -->
      <template v-else-if="!bundleStatus.installed.value">
        <v-notice type="warning" class="notice">
          <div>
            <p class="notice-title">The automated-import bundle is not installed.</p>
            <p>
              Automated import requires the <code>@localazy/directus-extension-localazy-automation</code> bundle to be installed in your
              Directus instance. Without it, webhook events from Localazy cannot be received.
            </p>
            <p>
              <a :href="bundleReadmeUrl" target="_blank" rel="noopener noreferrer">Read the bundle installation guide on GitHub</a>
            </p>
          </div>
        </v-notice>
        <v-button secondary class="recheck-button" :loading="bundleStatus.loading.value" @click="onRecheck">
          <v-icon name="refresh" left />
          Re-check
        </v-button>
      </template>

      <!-- State B: bundle installed -->
      <template v-else-if="hydrated && installed">
        <p v-if="bundleStatus.status.value?.version" class="bundle-version">
          Bundle version: <code>{{ bundleStatus.status.value.version }}</code>
        </p>
        <AutomationForm v-model:edits="settingsEdits" />
      </template>
    </div>
  </private-view>
</template>

<script lang="ts" setup>
import { onBeforeMount } from 'vue';
import { useApi } from '@directus/extensions-sdk';
import Navigation from './components/Navigation.vue';
import ErrorsNotice from './components/ErrorsNotice.vue';
import AutomationForm from './components/Automation/AutomationForm.vue';
import { useLocalazySettingsStore } from './stores/localazy-settings-store';
import { useSingletonForm } from './composables/use-singleton-form';
import { useLocalazyBoot } from './composables/use-localazy-boot';
import { useBundleStatus } from './composables/use-bundle-status';
import { useDirectusNotificationsStore } from './composables/use-directus-stores';
import { BUNDLE_README_URL } from './data/constants';

const bundleReadmeUrl = BUNDLE_README_URL;

const settingsStore = useLocalazySettingsStore();
const { edits: settingsEdits, changesExist, save: saveSettings, loading: saving } = useSingletonForm(settingsStore);

const notificationsStore = useDirectusNotificationsStore();
const { installed, hydrated, localazyData, boot } = useLocalazyBoot();

const api = useApi();
const bundleStatus = useBundleStatus(api);

async function onSaveChanges() {
  await saveSettings();
  notificationsStore.add({ title: 'Automation settings saved' });
}

async function onRecheck() {
  await bundleStatus.check();
}

onBeforeMount(() => {
  // The boot sequence is idempotent (other pages call it too), so even when the bundle is
  // absent we still kick it off — the settings form needs the singleton row hydrated to
  // render correctly the moment the user installs the bundle and re-checks.
  void boot();
  void bundleStatus.check();
});
</script>

<style lang="scss" scoped>
@use './styles/mixins/page' as *;

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

.notice {
  margin-top: 16px;
  margin-bottom: 16px;
}

.notice-title {
  font-weight: 600;
  margin-bottom: 6px;
}

.notice a {
  text-decoration: underline;
}

.status-line {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 24px;
  color: var(--foreground-subdued);
  font-size: 14px;
}

.recheck-button {
  margin-bottom: 16px;
}

.bundle-version {
  font-size: 12px;
  color: var(--foreground-subdued);
  margin-top: 16px;
  margin-bottom: 16px;

  code {
    background: var(--background-subdued);
    padding: 1px 4px;
    border-radius: 4px;
  }
}

code {
  background: var(--background-subdued);
  padding: 1px 4px;
  border-radius: 4px;
  font-size: 12px;
}
</style>
