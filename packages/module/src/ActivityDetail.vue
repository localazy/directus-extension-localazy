<template>
  <private-view title="Sync session" icon="history">
    <template #headline>
      <v-breadcrumb :items="breadcrumb" />
    </template>

    <template #navigation>
      <Navigation />
    </template>

    <template v-if="canTerminate" #actions>
      <v-button
        v-tooltip.bottom="'Abort this run and release the sync lock so the next Import can proceed'"
        kind="warning"
        :loading="terminating"
        :disabled="terminating"
        @click="showTerminateDialog = true"
      >
        Terminate session
      </v-button>
      <v-dialog v-model="showTerminateDialog" @esc="showTerminateDialog = false">
        <v-card>
          <v-card-title>Terminate this sync session?</v-card-title>
          <v-card-text>
            This marks the session as aborted, and releases the sync lock if it's stuck so the next Import can proceed. Any work still in
            flight (server-side or in another browser tab) is abandoned but not undone — partially-imported translations stay in place. Use
            this when a run is stuck and won't finish on its own.
          </v-card-text>
          <v-card-actions>
            <v-button secondary @click="showTerminateDialog = false">Cancel</v-button>
            <v-button kind="warning" :disabled="terminating" :loading="terminating" @click="confirmTerminate">Terminate</v-button>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </template>

    <div class="panel">
      <div v-if="loading" class="loading">
        <v-progress-circular indeterminate />
      </div>

      <div v-else-if="!session" class="empty-state">Session not found. It may have been cleared or trimmed by the retention policy.</div>

      <div v-else>
        <section class="metadata-section">
          <session-metadata :session="session" :entries-count="entries.length" />
          <div v-if="session.summary" class="summary-row">
            <div class="summary-label">Summary</div>
            <div class="summary-value">{{ session.summary }}</div>
          </div>
        </section>

        <section class="entries-section">
          <div v-if="entries.length === 0" class="empty-state">No log entries to display.</div>

          <div v-else class="entries-list">
            <div v-for="(entry, idx) in entries" :key="idx" class="entry-row" :class="`entry-${entry.level}`">
              <div class="entry-header">
                <v-icon :name="iconForLevel(entry.level)" small class="entry-icon" />
                <span class="entry-timestamp">{{ formatTime(entry.timestamp) }}</span>
                <span class="entry-message">{{ entry.message }}</span>
                <span v-if="entryUser(entry)" class="entry-user">by {{ entryUser(entry) }}</span>
              </div>
              <pre v-if="entry.data" class="entry-data">{{ JSON.stringify(entry.data, null, 2) }}</pre>
            </div>
          </div>
        </section>
      </div>
    </div>
  </private-view>
</template>

<script lang="ts" setup>
import { computed, onBeforeMount, ref } from 'vue';
import { useRoute } from 'vue-router';
import Navigation from './components/Navigation.vue';
import SessionMetadata from './components/Activity/SessionMetadata.vue';
import { storeToRefs } from 'pinia';
import { useLocalazySyncLogStore } from './stores/localazy-sync-log-store';
import { useLocalazySyncStateStore } from './stores/localazy-sync-state-store';
import { useLocalazyBoot } from './composables/use-localazy-boot';
import { useSyncLogEntries } from './composables/use-sync-log-entries';
import { useSyncLogUserNames } from './composables/use-sync-log-user-names';
import { useDirectusUserStore, useDirectusNotificationsStore } from './composables/use-directus-stores';
import { isSyncLockStale } from '@localazy/directus-common';
import type { SyncLogEntry, SyncLogSession } from '@localazy/directus-common';

const route = useRoute();
const sessionId = computed(() => String(route.params.sessionId || ''));

const session = ref<SyncLogSession | null>(null);
const loading = ref(true);

const { boot } = useLocalazyBoot();
const syncLogStore = useLocalazySyncLogStore();
const syncStateStore = useLocalazySyncStateStore();
const { data: syncStateData } = storeToRefs(syncStateStore);
const notificationsStore = useDirectusNotificationsStore();
const directusUserStore = useDirectusUserStore();

const showTerminateDialog = ref(false);
const terminating = ref(false);

// Only an unfinished run can be terminated. A session that already reached a terminal
// status (completed / failed / aborted / …) has nothing to abort and holds no lock.
const canTerminate = computed(() => session.value?.status === 'in_progress');

/**
 * Mark the session aborted, then release the advisory sync lock — but only if it's held
 * and the orchestrator would already consider it stale (dead worker / past the 2 h
 * ceiling). The lock isn't id-linked to a log row, so a held-but-live lock may belong to a
 * different, healthy run; clearing that would abort real in-flight work. Gating on
 * staleness means terminating an old stuck session never disturbs a concurrent live run,
 * while a genuinely-stuck lock (the case that motivated this button) still gets cleared so
 * the AdvancedSettings "stuck" banner clears and the row is left clean.
 *
 * We reload the sync-state singleton first: this page doesn't otherwise read it, so its
 * cached `data` would still hold the pre-fetch defaults and misreport the lock as free.
 */
async function confirmTerminate() {
  if (!session.value) return;
  terminating.value = true;
  try {
    await syncLogStore.terminate(session.value, directusUserStore.currentUser?.id ?? null);
    await syncStateStore.reload();
    const lock = syncStateData.value;
    if (lock.sync_in_progress && isSyncLockStale(lock, Date.now())) {
      await syncStateStore.save({
        sync_in_progress: false,
        sync_started_at: null,
        sync_initiator: '',
        sync_pending: false,
        sync_items_processed: 0,
        sync_last_heartbeat_at: null,
        acquired_token: '',
      });
    }
    // Re-fetch so the metadata block reflects the aborted status + the new log entry.
    session.value = await syncLogStore.getById(sessionId.value);
    notificationsStore.add({ title: 'Session terminated', type: 'success' });
    showTerminateDialog.value = false;
  } finally {
    terminating.value = false;
  }
}

const breadcrumb = computed(() => [
  { name: 'Localazy', to: '/localazy' },
  { name: 'Activity', to: '/localazy/activity' },
]);

const { entries, formatTime, iconForLevel } = useSyncLogEntries(session);

// Feed the single loaded session into the user-name resolver so per-entry `data.user`
// ids get batch-fetched alongside the session-level `initiator_user`. The resolver
// returns `null` until the fetch settles; the template guards on a non-null result so
// the "by …" suffix only renders once we have something useful to show.
const sessionsForResolver = computed<SyncLogSession[]>(() => (session.value ? [session.value] : []));
const { lookupUserName } = useSyncLogUserNames(sessionsForResolver);

function entryUser(entry: SyncLogEntry): string | null {
  const candidate = entry.data?.user;
  if (typeof candidate !== 'string' || candidate.length === 0) return null;
  return lookupUserName(candidate);
}

onBeforeMount(async () => {
  await boot();
  loading.value = true;
  try {
    session.value = await syncLogStore.getById(sessionId.value);
  } finally {
    loading.value = false;
  }
});
</script>

<style lang="scss" scoped>
.panel {
  padding: var(--content-padding);
  padding-top: 0;
  padding-bottom: var(--content-padding-bottom);
}

.loading,
.empty-state {
  padding: 48px;
  text-align: center;
  color: var(--theme--foreground);
}

.metadata-section {
  background-color: var(--theme--background-normal);
  padding: 24px;
  border-radius: var(--theme--border-radius);
  margin-bottom: 16px;
}

.summary-row {
  margin-top: 24px;
  border-top: 1px solid var(--theme--border-color-subdued);
  padding-top: 16px;
}

.summary-label {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--theme--foreground);
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

.summary-value {
  font-size: 14px;
  color: var(--theme--foreground);
}

.entries-section {
  background-color: var(--theme--background-normal);
  padding: 24px;
  border-radius: var(--theme--border-radius);
}

.entries-list {
  display: flex;
  flex-direction: column;
}

.entry-row {
  padding: 12px 0;
  border-bottom: 1px solid var(--theme--border-color-subdued);
  font-family: var(--theme--fonts--monospace--font-family);

  &:last-child {
    border-bottom: none;
  }
}

.entry-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.entry-icon {
  flex-shrink: 0;
}

.entry-timestamp {
  color: var(--theme--foreground);
  font-size: 12px;
  white-space: nowrap;
  min-width: 80px;
}

.entry-message {
  font-size: 13px;
  color: var(--theme--foreground);
}

.entry-user {
  font-size: 12px;
  color: var(--theme--foreground);
  font-style: italic;
  margin-left: 4px;
}

.entry-info .entry-icon {
  color: var(--theme--primary);
}
.entry-warn .entry-icon {
  color: var(--theme--warning);
}
.entry-error .entry-icon {
  color: var(--theme--danger);
}

.entry-data {
  margin: 8px 0 0 32px;
  padding: 8px 12px;
  background-color: var(--theme--background-subdued);
  border-radius: var(--theme--border-radius);
  font-size: 12px;
  color: var(--theme--foreground);
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
