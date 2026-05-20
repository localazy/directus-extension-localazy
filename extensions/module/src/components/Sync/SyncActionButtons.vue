<template>
  <div>
    <div class="sync-action-buttons">
      <div class="sync-group">
        <v-button :disabled="disableUploadButtons" secondary @click="$emit('upload')"> Export to Localazy </v-button>
        <v-menu show-arrow placement="bottom-end">
          <template #activator="{ toggle }">
            <v-button :disabled="disableUploadButtons" secondary class="sync-options" @click="toggle">
              <v-icon name="expand_more" />
            </v-button>
          </template>
          <v-list>
            <v-list-item clickable @click="$emit('upload-full')">
              <v-list-item-icon><v-icon name="refresh" /></v-list-item-icon>
              <v-list-item-content>Full Upload (re-push everything)</v-list-item-content>
            </v-list-item>
          </v-list>
        </v-menu>
      </div>
      <div class="sync-group">
        <v-button
          v-tooltip="syncInProgress ? 'Localazy is syncing — try again in a moment' : null"
          :disabled="disableDownloadButtons"
          secondary
          @click="$emit('download')"
        >
          Import to Directus
        </v-button>
        <v-menu show-arrow placement="bottom-end">
          <template #activator="{ toggle }">
            <v-button :disabled="disableDownloadButtons" secondary class="sync-options" @click="toggle">
              <v-icon name="expand_more" />
            </v-button>
          </template>
          <v-list>
            <v-list-item clickable @click="$emit('download-full')">
              <v-list-item-icon><v-icon name="refresh" /></v-list-item-icon>
              <v-list-item-content>Full Sync (rebuild from scratch)</v-list-item-content>
            </v-list-item>
          </v-list>
        </v-menu>
      </div>
      <v-button :disabled="!hasChanges" secondary @click="$emit('save-settings')"> Save </v-button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { storeToRefs } from 'pinia';
import { computed } from 'vue';
import { useLocalazyStore } from '../../stores/localazy-store';
import { useLocalazySyncStateStore } from '../../stores/localazy-sync-state-store';
import { useNow } from '../../composables/use-now';
import { SYNC_LOCK_HARD_CEILING_MS, SYNC_LOCK_STALE_HEARTBEAT_MS } from '../../../../common/services/orchestrator/lock-constants';

// `download` runs an incremental sync (default). `download-full` triggers a Full Sync,
// which rebuilds from scratch by running the same flow with an empty in-memory cursor.
// `upload` mirrors `download` for the export flow (incremental by default), and
// `upload-full` triggers a Full Upload (re-push every item regardless of cursor state).
defineEmits(['download', 'download-full', 'upload', 'upload-full', 'save-settings']);

const props = defineProps({
  hasChanges: {
    type: Boolean,
    required: true,
  },
  disableSync: {
    type: Boolean,
    required: true,
  },
});

const { localazyProject, shouldDisableSyncOperations } = storeToRefs(useLocalazyStore());
const isNotConnectedToLocalazy = computed(() => localazyProject.value === null);

const { data: syncStateData } = storeToRefs(useLocalazySyncStateStore());

// Reactive `Date.now()` tick — without this the staleness `computed` below stays stuck on
// whatever value it captured the last time another tracked dep changed, so a cross-tab
// observer of a remote-held lock wouldn't see the threshold cross.
const now = useNow();

/**
 * Mirrors `isLockStale` from the orchestrator. We can't show the disabled state forever
 * when a previous run zombied — the staleness check here lets the Import button re-enable
 * once the orchestrator would treat the lock as stealable, matching the actual behaviour
 * the user would hit on click.
 */
const syncInProgress = computed(() => {
  const state = syncStateData.value;
  if (!state.sync_in_progress) return false;
  if (state.sync_started_at) {
    const startedMs = Date.parse(state.sync_started_at);
    if (Number.isFinite(startedMs) && now.value - startedMs > SYNC_LOCK_HARD_CEILING_MS) return false;
  }
  if (state.sync_last_heartbeat_at) {
    const heartbeatMs = Date.parse(state.sync_last_heartbeat_at);
    if (Number.isFinite(heartbeatMs) && now.value - heartbeatMs > SYNC_LOCK_STALE_HEARTBEAT_MS) return false;
  }
  return true;
});

// Base disable: upload buttons follow the legacy disable rules. The download buttons
// additionally disable while another run holds the lock — clicking would just emit a
// "sync already in progress" notification, so keeping the affordance off keeps the UX
// honest.
const disableSyncButtons = computed(() => props.disableSync || isNotConnectedToLocalazy.value || shouldDisableSyncOperations.value);
const disableUploadButtons = computed(() => disableSyncButtons.value);
const disableDownloadButtons = computed(() => disableSyncButtons.value || syncInProgress.value);
</script>

<style lang="scss" scoped>
.sync-action-buttons {
  display: flex;
  justify-content: space-between;
  gap: 4px;
}

.sync-group {
  display: flex;
  gap: 2px;
}

.sync-options {
  --v-button-min-width: 28px;
  --v-button-padding: 0 8px;
}
</style>
