<template>
  <span class="status-label" :class="statusClass">
    {{ label }}
  </span>
</template>

<script lang="ts" setup>
import { computed } from 'vue';

const props = defineProps<{ status: string }>();

/**
 * Maps the persisted status string (free string by design — see
 * `common/models/collections-data/sync-log.ts`) to a colour + label.
 * Unknown statuses fall through to the neutral style so a future status
 * doesn't render blank.
 */
const label = computed(() => {
  switch (props.status) {
    case 'in_progress':
      return 'In progress';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    case 'partial':
      return 'Completed (errors)';
    case 'skipped':
      return 'Skipped';
    default:
      return props.status;
  }
});

const statusClass = computed(() => {
  switch (props.status) {
    case 'in_progress':
      return 'status-warning';
    case 'completed':
      return 'status-success';
    case 'failed':
      return 'status-danger';
    case 'partial':
      return 'status-warning';
    case 'skipped':
      return 'status-neutral';
    default:
      return 'status-neutral';
  }
});
</script>

<style lang="scss" scoped>
.status-label {
  display: inline-block;
  padding: 2px 8px;
  border-radius: var(--border-radius);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
}

.status-success {
  background: var(--success-25, rgba(46, 184, 124, 0.12));
  color: var(--success);
}

.status-warning {
  background: var(--warning-25, rgba(255, 167, 38, 0.15));
  color: var(--warning);
}

.status-danger {
  background: var(--danger-25, rgba(231, 76, 60, 0.12));
  color: var(--danger);
}

.status-neutral {
  background: var(--background-subdued);
  color: var(--foreground-subdued);
}
</style>
