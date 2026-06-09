<template>
  <div class="connection-overview">
    <div class="overview-header">
      <div class="connection-info">
        <span class="connection-label">Localazy connection</span>
        <div class="connection-status">
          <span class="status-pill" :class="statusPillClass">
            <span class="status-dot" />
            {{ statusLabel }}
          </span>
          <a
            v-if="isConnected && localazyProject?.url"
            :href="localazyProject.url"
            target="_blank"
            rel="noopener"
            class="project-name project-name--link"
            title="Open Localazy project in a new tab"
          >
            {{ localazyProject?.name }}
          </a>
          <span v-else-if="isConnected" class="project-name">{{ localazyProject?.name }}</span>
        </div>
      </div>

      <div class="header-actions">
        <button
          type="button"
          class="header-action"
          :class="{ 'header-action--disabled': !hasLocalazyToken }"
          :disabled="!hasLocalazyToken"
          title="Reconnect to Localazy"
          @click="onReconnect"
        >
          <v-icon name="sync" />
        </button>
      </div>
    </div>

    <div v-if="isConnected" class="overview-body">
      <div class="metric">
        <span class="metric-label">Directus source language</span>
        <span class="metric-value">
          {{ settings?.source_language }}
          <span class="metric-meta">({{ directusSourceLanguage?.name }})</span>
        </span>
      </div>

      <div class="metric">
        <span class="metric-label">Localazy source language</span>
        <span class="metric-value">
          {{ localazySourceLanguage?.locale }}
          <span class="metric-meta">({{ localazySourceLanguage?.name }})</span>
        </span>
      </div>

      <div class="metric">
        <span class="metric-label">Organization keys</span>
        <span class="metric-value" :class="{ 'over-key-limit': exceededKeyLimit }">
          {{ formattedUsedKeys }} <span class="metric-meta">/ {{ formattedAvailableKeys }}</span>
        </span>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { storeToRefs } from 'pinia';
import { computed, PropType } from 'vue';
import { getLocalazyLanguages, findLocalazyLanguageByLocale } from '@localazy/languages';
import { useLocalazyStore } from '../../stores/localazy-store';
import { DirectusLocalazyAdapter } from '@localazy/directus-common';
import { Settings } from '@localazy/directus-common';
import { LocalazyData } from '@localazy/directus-common';

const { hydrateLocalazyData } = useLocalazyStore();

const props = defineProps({
  settings: {
    type: Object as PropType<Settings | null>,
    required: true,
  },
  localazyData: {
    type: Object as PropType<LocalazyData | null>,
    required: true,
  },
});

const { hydrating, localazyProject, exceededKeyLimit } = storeToRefs(useLocalazyStore());

const isConnected = computed(() => !hydrating.value && !!localazyProject.value);
const hasLocalazyToken = computed(() => !!props.localazyData?.access_token);
const isConnecting = computed(() => hydrating.value);
const localazySourceLanguage = computed(() =>
  getLocalazyLanguages().find((lang) => lang.localazyId === localazyProject.value?.sourceLanguage),
);
const directusSourceLanguage = computed(() => {
  if (!props.settings?.source_language) return null;
  return findLocalazyLanguageByLocale(DirectusLocalazyAdapter.transformDirectusToLocalazyLanguage(props.settings.source_language));
});

const statusLabel = computed(() => {
  if (isConnecting.value) return 'Connecting';
  if (isConnected.value) return 'Connected';
  return 'Not connected';
});

const statusPillClass = computed(() => {
  if (isConnecting.value) return 'status-pill--warning';
  if (isConnected.value) return 'status-pill--success';
  return 'status-pill--danger';
});

const numberFormatter = new Intl.NumberFormat('en-US');
const formatNumber = (n: number | undefined | null): string => (typeof n === 'number' ? numberFormatter.format(n) : '—');
const formattedUsedKeys = computed(() => formatNumber(localazyProject.value?.organization.usedKeys));
const formattedAvailableKeys = computed(() => formatNumber(localazyProject.value?.organization.availableKeys));

async function onReconnect() {
  if (hasLocalazyToken.value) {
    await hydrateLocalazyData({ force: true, localazyData: props.localazyData });
  }
}
</script>

<style lang="scss" scoped>
@use '../../styles/mixins/common' as *;

.connection-overview {
  @include common;
  display: flex;
  flex-direction: column;
}

.overview-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.connection-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

$divider-color: var(--border-normal, var(--theme--border-color-accent));
$radius: var(--border-radius, var(--theme--border-radius));
$fg-normal: var(--foreground-normal, var(--theme--foreground));
$fg-subdued: var(--foreground-subdued, var(--theme--foreground));
$fg-accent: var(--foreground-accent, var(--theme--foreground-accent, var(--theme--foreground)));

.connection-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: $fg-accent;
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: currentColor;
  }
}

.status-pill--success {
  background: var(--success-25, rgba(46, 184, 124, 0.12));
  color: var(--theme--success);
}

.status-pill--warning {
  background: var(--warning-25, rgba(255, 167, 38, 0.15));
  color: var(--theme--warning);

  .status-dot {
    animation: pulse 1.6s ease-in-out infinite;
  }
}

.status-pill--danger {
  background: var(--danger-25, rgba(231, 76, 60, 0.12));
  color: var(--theme--danger);
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}

.project-name {
  font-size: 16px;
  font-weight: 600;
  color: $fg-normal;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-name--link {
  text-decoration: none;

  &:hover {
    color: var(--theme--primary);
    text-decoration: underline;
  }
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.header-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: $radius;
  border: none;
  background: transparent;
  color: $fg-normal;
  cursor: pointer;
  transition: background-color var(--fast) var(--transition);
  text-decoration: none;

  &:hover {
    background-color: var(--theme--background-subdued);
  }

  &--disabled,
  &--disabled:hover {
    opacity: 0.4;
    cursor: not-allowed;
    background: transparent;
    pointer-events: none;
  }
}

.overview-body {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid $divider-color;

  @media (min-width: 720px) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
  }
}

.metric {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  background: var(--theme--background-subdued);
  border-radius: $radius;
  min-width: 0;
}

.metric-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: $fg-accent;
}

.metric-value {
  font-size: 15px;
  font-weight: 600;
  color: $fg-normal;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.metric-meta {
  font-weight: 400;
  color: $fg-subdued;
}

.over-key-limit {
  color: var(--theme--danger);
}
</style>
