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

      <div v-if="syncLookStuck" class="operator-tools">
        <h3 class="operator-tools-title">Operator tools</h3>
        <p class="operator-tools-note">
          A sync has been running for more than 5 minutes without finishing. If you're sure no sync is in flight (e.g. the Directus instance
          was restarted mid-run), clear the lock so the next Import can proceed.
        </p>
        <v-button kind="warning" small @click="onClearStuckSync"> Clear stuck sync </v-button>
        <v-dialog v-model="showClearConfirmDialog" @esc="showClearConfirmDialog = false">
          <v-card>
            <v-card-title>Clear the stuck sync lock?</v-card-title>
            <v-card-text>
              This forces the sync state to "idle" without verifying whether a run is actually live. Use only if you're sure no sync is in
              progress.
            </v-card-text>
            <v-card-actions>
              <v-button secondary @click="showClearConfirmDialog = false">Cancel</v-button>
              <v-button kind="warning" :loading="clearing" @click="confirmClearStuckSync">Clear lock</v-button>
            </v-card-actions>
          </v-card>
        </v-dialog>
      </div>
    </div>
  </private-view>
</template>

<script lang="ts" setup>
import { computed, onBeforeMount, ref } from 'vue';
import { storeToRefs } from 'pinia';
import AdvancedSettingsForm from './components/AdvancedSettings/AdvancedSettingsForm.vue';
import Navigation from './components/Navigation.vue';
import ErrorsNotice from './components/ErrorsNotice.vue';
import { LOCALAZY_COLLECTIONS } from './stores/localazy-installer-store';
import { useLocalazySettingsStore } from './stores/localazy-settings-store';
import { useLocalazySyncStateStore } from './stores/localazy-sync-state-store';
import { useSingletonForm } from './composables/use-singleton-form';
import { useLocalazyBoot } from './composables/use-localazy-boot';
import { useDirectusNotificationsStore } from './composables/use-directus-stores';
import { SYNC_LOCK_STUCK_HINT_MS } from '../../common/services/orchestrator/lock-constants';

const settingsCollectionName = LOCALAZY_COLLECTIONS.settings;

const settingsStore = useLocalazySettingsStore();
const { edits: settingsEdits, changesExist, save: saveSettings, loading: saving } = useSingletonForm(settingsStore);

const notificationsStore = useDirectusNotificationsStore();
const { installed, hydrating, hydrated, localazyData, boot } = useLocalazyBoot();

const syncStateStore = useLocalazySyncStateStore();
const { data: syncStateData } = storeToRefs(syncStateStore);

const showClearConfirmDialog = ref(false);
const clearing = ref(false);

/**
 * "Looks stuck" surfaces the manual override only when the lock has been held longer
 * than the heartbeat-staleness threshold — at that point the orchestrator itself would
 * already let a contender steal, so the button is just the user-driven counterpart.
 * The threshold is intentionally generous (5 min) so a healthy long-running sync
 * doesn't surface the affordance and confuse operators.
 */
const syncLookStuck = computed(() => {
  const state = syncStateData.value;
  if (!state.sync_in_progress || !state.sync_started_at) return false;
  const startedMs = Date.parse(state.sync_started_at);
  if (!Number.isFinite(startedMs)) return false;
  return Date.now() - startedMs > SYNC_LOCK_STUCK_HINT_MS;
});

function onClearStuckSync() {
  showClearConfirmDialog.value = true;
}

async function confirmClearStuckSync() {
  clearing.value = true;
  try {
    // Force-clear the lock fields. Heartbeat / items-processed are reset for hygiene
    // even though they're inert when `sync_in_progress` is false — keeps the row clean
    // for the next acquire.
    await syncStateStore.save({
      sync_in_progress: false,
      sync_started_at: null,
      sync_initiator: '',
      sync_pending: false,
      sync_items_processed: 0,
      sync_last_heartbeat_at: null,
      acquired_token: '',
    });
    notificationsStore.add({ title: 'Sync lock cleared' });
    showClearConfirmDialog.value = false;
  } finally {
    clearing.value = false;
  }
}

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

.operator-tools {
  margin-top: 48px;
  padding: 16px;
  border: 1px solid var(--border-subdued);
  border-radius: var(--border-radius);
  background: var(--background-subdued);
}

.operator-tools-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 8px 0;
  color: var(--foreground-normal);
}

.operator-tools-note {
  font-size: 13px;
  color: var(--foreground-subdued);
  margin: 0 0 12px 0;
  max-width: 640px;
}
</style>
