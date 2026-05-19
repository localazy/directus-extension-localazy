<template>
  <div class="metadata-block">
    <div class="metadata-cell">
      <div class="metadata-label">Status</div>
      <status-label :status="session.status" />
    </div>
    <div class="metadata-cell">
      <div class="metadata-label">Event</div>
      <div class="metadata-value">{{ session.event_type }}</div>
    </div>
    <div class="metadata-cell">
      <div class="metadata-label">Started at</div>
      <div class="metadata-value">{{ formatStartedAt(session) }}</div>
    </div>
    <div class="metadata-cell">
      <div class="metadata-label">Duration</div>
      <div class="metadata-value">{{ formatDuration(session) }}</div>
    </div>
    <div class="metadata-cell">
      <div class="metadata-label">Triggered by</div>
      <div class="metadata-value">{{ session.initiator }}</div>
    </div>
    <div class="metadata-cell">
      <div class="metadata-label">Items processed</div>
      <div class="metadata-value">{{ session.items_processed }}</div>
    </div>
    <div v-if="entriesCount !== undefined" class="metadata-cell">
      <div class="metadata-label">Entries</div>
      <div class="metadata-value">{{ entriesCount }}</div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import StatusLabel from './StatusLabel.vue';
import { formatDuration, formatStartedAt } from '../../composables/use-activity-log';
import type { SyncLogSession } from '../../../../common/models/collections-data/sync-log';

defineProps<{
  session: SyncLogSession;
  entriesCount?: number;
}>();
</script>

<style lang="scss" scoped>
.metadata-block {
  display: flex;
  flex-wrap: wrap;
  gap: 32px;
}

.metadata-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 120px;
}

.metadata-label {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--theme--foreground-subdued);
  letter-spacing: 0.5px;
}

.metadata-value {
  font-size: 14px;
  color: var(--theme--foreground);
}
</style>
