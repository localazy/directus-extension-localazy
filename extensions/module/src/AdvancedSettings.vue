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

        <dl class="lock-state" data-testid="lock-state-details">
          <div class="lock-state-row">
            <dt>Initiator</dt>
            <dd>{{ lockInitiatorLabel }}</dd>
          </div>
          <div class="lock-state-row">
            <dt>Started at</dt>
            <dd>{{ lockStartedAtLabel }}</dd>
          </div>
          <div class="lock-state-row">
            <dt>Last heartbeat</dt>
            <dd>{{ lockLastHeartbeatLabel }}</dd>
          </div>
        </dl>

        <v-button kind="warning" small :disabled="clearing" :loading="clearing" @click="onClearStuckSync"> Clear stuck sync </v-button>
        <v-dialog v-model="showClearConfirmDialog" @esc="showClearConfirmDialog = false">
          <v-card>
            <v-card-title>Clear the stuck sync lock?</v-card-title>
            <v-card-text>
              Clearing the lock will let the next sync proceed. Any in-flight work (server-side or another browser tab) will be abandoned
              but will not be undone — partially-imported translations stay in place. Use this only if a sync has been stuck for more than 5
              minutes.
            </v-card-text>
            <v-card-actions>
              <v-button secondary @click="showClearConfirmDialog = false">Cancel</v-button>
              <v-button kind="warning" :disabled="clearing" :loading="clearing" @click="confirmClearStuckSync">Clear lock</v-button>
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
import { useNow } from './composables/use-now';
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

// Reactive `Date.now()` tick — without this the staleness `computed` below stays stuck on
// whatever value it captured the last time another tracked dep changed, so an observer
// tab wouldn't see the stuck-hint threshold cross.
const now = useNow();

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
  return now.value - startedMs > SYNC_LOCK_STUCK_HINT_MS;
});

/**
 * Pretty-format an ISO timestamp using the browser locale. Returns `'—'` when the field
 * is missing / unparseable so the operator-tools details block doesn't leak raw `null`s.
 */
function formatTimestamp(value: string | null | undefined): string {
  if (!value) return '—';
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return value;
  return new Date(ms).toLocaleString();
}

/**
 * Map the persisted `sync_initiator` to a human-readable label for the operator-tools
 * details block. The lock's `sync_initiator` is one of four values per the orchestrator's
 * `runIncrementalImport` contract: `'webhook'` (server-side webhook flow),
 * `'ui-incremental'` / `'ui-full'` (browser-initiated sync), or `''` (no sync has ever
 * run, in which case this block isn't rendered anyway because `syncLookStuck` requires
 * `sync_in_progress`). Anything else falls through to `'Unknown'` rather than leaking a
 * raw user UUID into the UI.
 */
const lockInitiatorLabel = computed(() => {
  const initiator = syncStateData.value.sync_initiator;
  if (!initiator) return '—';
  if (initiator === 'webhook') return 'Webhook';
  if (initiator === 'ui-incremental') return 'User-initiated (incremental)';
  if (initiator === 'ui-full') return 'User-initiated (full sync)';
  return 'Unknown';
});

const lockStartedAtLabel = computed(() => formatTimestamp(syncStateData.value.sync_started_at));
const lockLastHeartbeatLabel = computed(() => formatTimestamp(syncStateData.value.sync_last_heartbeat_at));

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
    notificationsStore.add({ title: 'Sync lock cleared', type: 'success' });
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

.lock-state {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 4px 16px;
  margin: 0 0 16px 0;
  padding: 8px 12px;
  background: var(--background-normal);
  border: 1px solid var(--border-subdued);
  border-radius: var(--border-radius);
  font-size: 12px;
  max-width: 640px;
}

.lock-state-row {
  display: contents;

  dt {
    color: var(--foreground-subdued);
    font-weight: 600;
  }

  dd {
    margin: 0;
    color: var(--foreground-normal);
    font-family: var(--family-monospace);
  }
}
</style>
