<template>
  <div>
    <table v-if="rows.length > 0" class="sessions-table">
      <thead>
        <tr>
          <th
            v-for="column in columns"
            :key="column.key"
            class="sortable-header"
            :class="{ active: currentSort.key === column.key }"
            @click="emit('sort', column.key)"
          >
            <div class="header-cell">
              <span>{{ column.label }}</span>
              <v-icon v-if="currentSort.key === column.key" small :name="currentSort.direction === 'asc' ? 'expand_less' : 'expand_more'" />
            </div>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="session in rows" :key="session.id" class="session-row" @click="emit('select', session.id)">
          <td>
            <status-label :status="session.status" />
          </td>
          <td>{{ formatStartedAt(session) }}</td>
          <td>{{ formatDuration(session) }}</td>
          <td>{{ formatInitiator(session.initiator, props.lookupUserName) }}</td>
          <td class="summary-cell">{{ session.summary || '-' }}</td>
        </tr>
      </tbody>
    </table>

    <div v-else class="empty-state">{{ emptyStateMessage }}</div>

    <v-pagination
      v-if="totalPages > 1"
      :model-value="page"
      :length="totalPages"
      :total-visible="7"
      @update:model-value="emit('update:page', $event)"
    />
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import StatusLabel from './StatusLabel.vue';
import {
  formatDuration,
  formatInitiator,
  formatStartedAt,
  type ActivityTab,
  type SortKey,
  type SortPreference,
} from '../../composables/use-activity-log';
import type { SyncLogSession } from '../../../../common/models/collections-data/sync-log';

const props = defineProps<{
  rows: SyncLogSession[];
  currentSort: SortPreference;
  page: number;
  totalPages: number;
  tab: ActivityTab;
  /**
   * Resolves a Directus user id to a display name (full name, or email fallback).
   * Returns `null` for unknown / deleted users — `formatInitiator` then falls back
   * to the generic "Triggered by user" label. The function is read inside the
   * template so Vue tracks its internal reactive deps and the cells re-render
   * once the names arrive from the `/users` fetch.
   */
  lookupUserName: (userId: string) => string | null;
}>();

const emptyStateMessage = computed(() => `No ${props.tab} sessions to display.`);

const emit = defineEmits<{
  (event: 'sort', key: SortKey): void;
  (event: 'select', sessionId: string): void;
  (event: 'update:page', page: number): void;
}>();

// Order matches Strapi's layout: Status / Started at / Duration / Initiator / Summary.
const columns: Array<{ key: SortKey; label: string }> = [
  { key: 'status', label: 'Status' },
  { key: 'started_at', label: 'Started at' },
  { key: 'duration', label: 'Duration' },
  { key: 'initiator', label: 'Initiated by' },
  { key: 'summary', label: 'Summary' },
];
</script>

<style lang="scss" scoped>
.sessions-table {
  width: 100%;
  border-collapse: collapse;
}

.sortable-header {
  text-align: left;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-subdued);
  cursor: pointer;
  user-select: none;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--foreground-subdued);
  letter-spacing: 0.5px;

  &.active {
    color: var(--primary);
  }
}

.header-cell {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.session-row {
  cursor: pointer;
  transition: background-color var(--fast) var(--transition);

  &:hover {
    background-color: var(--background-subdued);
  }

  td {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-subdued);
    font-size: 14px;
  }
}

.summary-cell {
  max-width: 480px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-state {
  padding: 56px 32px;
  text-align: center;
  color: var(--foreground-subdued);
  font-size: 14px;
}
</style>
