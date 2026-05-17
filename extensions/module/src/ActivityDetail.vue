<template>
  <private-view title="Sync session" icon="history">
    <template #headline>
      <v-breadcrumb :items="breadcrumb" />
    </template>

    <template #navigation>
      <Navigation />
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
import { useLocalazySyncLogStore } from './stores/localazy-sync-log-store';
import { useLocalazyBoot } from './composables/use-localazy-boot';
import { useSyncLogEntries } from './composables/use-sync-log-entries';
import type { SyncLogSession } from '../../common/models/collections-data/sync-log';

const route = useRoute();
const sessionId = computed(() => String(route.params.sessionId || ''));

const session = ref<SyncLogSession | null>(null);
const loading = ref(true);

const { boot } = useLocalazyBoot();
const syncLogStore = useLocalazySyncLogStore();

const breadcrumb = computed(() => [
  { name: 'Localazy', to: '/localazy' },
  { name: 'Activity', to: '/localazy/activity' },
]);

const { entries, formatTime, iconForLevel } = useSyncLogEntries(session);

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
  color: var(--foreground-subdued);
}

.metadata-section {
  background-color: var(--background-normal);
  padding: 24px;
  border-radius: var(--border-radius);
  margin-bottom: 16px;
}

.summary-row {
  margin-top: 24px;
  border-top: 1px solid var(--border-subdued);
  padding-top: 16px;
}

.summary-label {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--foreground-subdued);
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

.summary-value {
  font-size: 14px;
  color: var(--foreground-normal);
}

.entries-section {
  background-color: var(--background-normal);
  padding: 24px;
  border-radius: var(--border-radius);
}

.entries-list {
  display: flex;
  flex-direction: column;
}

.entry-row {
  padding: 12px 0;
  border-bottom: 1px solid var(--border-subdued);
  font-family: var(--family-monospace);

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
  color: var(--foreground-subdued);
  font-size: 12px;
  white-space: nowrap;
  min-width: 80px;
}

.entry-message {
  font-size: 13px;
  color: var(--foreground-normal);
}

.entry-info .entry-icon {
  color: var(--primary);
}
.entry-warn .entry-icon {
  color: var(--warning);
}
.entry-error .entry-icon {
  color: var(--danger);
}

.entry-data {
  margin: 8px 0 0 32px;
  padding: 8px 12px;
  background-color: var(--background-subdued);
  border-radius: var(--border-radius);
  font-size: 12px;
  color: var(--foreground-subdued);
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
