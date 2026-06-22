<template>
  <div>
    <v-notice v-if="hasLocalazyErrors" type="danger">
      <div class="message">
        <div>
          <h2>{{ title }}</h2>
          <div>{{ helpMessage }}</div>
        </div>

        <v-button v-if="currentError.type === 'project'" small :loading="hydrating" @click="onReconnect">Reconnect to Localazy </v-button>
      </div>
    </v-notice>
    <v-notice v-if="hasDirectusErrors" type="danger">
      <div class="messages">
        <div v-for="(directusError, index) in directusErrors" :key="index" class="error-row">
          <div class="error-header">
            <button type="button" class="error-summary" :aria-expanded="isExpanded(index)" @click="toggleExpanded(index)">
              <v-icon :name="isExpanded(index) ? 'expand_more' : 'chevron_right'" small class="expand-icon" />
              <span class="message-text" :title="directusError.message">{{ directusError.message }}</span>
              <span v-if="directusError.count > 1" class="message-count">×{{ directusError.count }}</span>
            </button>
            <v-icon name="clear" clickable class="clear-icon" @click="clearDirectusError(index)" />
          </div>

          <div v-if="isExpanded(index)" class="error-detail">
            <p class="detail-hint">Records the import could not write. Open one to fix the value (e.g. shorten it or widen the field).</p>
            <ul v-if="directusError.occurrences.length > 0" class="occurrence-list">
              <li v-for="(occ, oIndex) in directusError.occurrences" :key="oIndex" class="occurrence">
                <span class="occurrence-where">
                  <code>{{ occ.collection }}</code> · <code>{{ occ.itemId }}</code>
                  <span v-if="occ.languages.length" class="occurrence-langs">({{ occ.languages.join(', ') }})</span>
                </span>
                <router-link class="occurrence-link" :to="`/content/${occ.collection}/${occ.itemId}`">
                  <v-icon name="open_in_new" x-small /> Open in Directus
                </router-link>
              </li>
            </ul>
            <p v-else class="detail-empty">No record-level details captured for this error.</p>

            <div class="detail-footer">
              <a v-if="localazyProjectUrl" class="localazy-link" :href="localazyProjectUrl" target="_blank" rel="noopener noreferrer">
                <v-icon name="open_in_new" x-small /> Open project in Localazy
              </a>
              <span v-if="directusError.count > directusError.occurrences.length" class="detail-note">
                Showing {{ directusError.occurrences.length }} of {{ directusError.count }} occurrence{{
                  directusError.count === 1 ? '' : 's'
                }}.
              </span>
            </div>
          </div>
        </div>
      </div>
    </v-notice>
  </div>
</template>

<script lang="ts" setup>
import { storeToRefs } from 'pinia';
import { computed, PropType, ref } from 'vue';
import { useErrorsStore } from '../stores/errors-store';
import { useLocalazyStore } from '../stores/localazy-store';
import { LocalazyData } from '@localazy/directus-common';

const props = defineProps({
  localazyData: {
    type: Object as PropType<LocalazyData | null>,
    required: true,
  },
});

const { localazyErrors, directusErrors, hasLocalazyErrors, hasDirectusErrors } = storeToRefs(useErrorsStore());
const { clearDirectusError } = useErrorsStore();

// Which grouped Directus errors are expanded to show their per-record occurrences. Keyed by
// list index — transient page state, fine to reset on navigation.
const expandedDirectus = ref<Set<number>>(new Set());
const isExpanded = (index: number) => expandedDirectus.value.has(index);
function toggleExpanded(index: number) {
  const next = new Set(expandedDirectus.value);
  if (next.has(index)) next.delete(index);
  else next.add(index);
  expandedDirectus.value = next;
}

const localazyProjectUrl = computed(() => props.localazyData?.project_url || null);
const { hydrateLocalazyData } = useLocalazyStore();
const { hydrating } = storeToRefs(useLocalazyStore());

const currentError = computed(() => {
  const { project, file, import: importErrors, export: exportErrors } = localazyErrors.value;

  if (project.length > 0) {
    return {
      type: 'project',
      error: project[0],
    };
  }
  if (file.length > 0) {
    return {
      type: 'file',
      error: file[0],
    };
  }
  if (importErrors.length > 0) {
    return {
      type: 'import',
      error: importErrors[0],
    };
  }
  if (exportErrors.length > 0) {
    return {
      type: 'export',
      error: exportErrors[0],
    };
  }
  return {
    type: 'none',
    error: null,
  };
});

const title = computed(() => {
  const { type } = currentError.value;
  switch (type) {
    case 'project':
      return 'Could not connect to Localazy project.';
    case 'file':
      return 'Could retrieve resources from Localazy.';
    case 'import':
      return 'Could not import translation.';
    case 'export':
      return 'Could not export translations.';
    default:
      return 'Unknown error.';
  }
});

const helpMessage = computed(() => {
  const { error } = currentError.value;
  if (error?.code === 401) {
    return 'Please verify your Localazy token is up-to-date.';
  }
  return 'Please contact us at team@localazy.com for help.';
});

async function onReconnect() {
  await hydrateLocalazyData({ force: true, localazyData: props.localazyData });
}
</script>

<style scoped lang="scss">
.messages {
  display: flex;
  flex-direction: column;
  width: 100%;
  gap: 8px;
}

.error-row {
  width: 100%;
}

.error-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
}

/* The summary is a button so the whole preview row toggles the detail (keyboard-accessible),
   but it must look like inline text, not a form control. */
.error-summary {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  flex: 1;
  min-width: 0;
  background: none;
  border: none;
  padding: 0;
  margin: 0;
  text-align: left;
  cursor: pointer;
  color: inherit;
  font: inherit;
}

.expand-icon {
  flex-shrink: 0;
  margin-top: 1px;
}

/* Directus value errors can embed a multi-KB JSON blob. The store masks the worst of it,
   but clamp here too so a single long message can't blow out the notice height — the full
   text stays available via the element's `title` tooltip and the expandable detail. */
.message-text {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
  min-width: 0;
}

.message-count {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  white-space: nowrap;
  opacity: 0.85;
}

.clear-icon {
  flex-shrink: 0;
}

.error-detail {
  margin: 6px 0 4px 22px;
  padding: 10px 12px;
  border-radius: var(--theme--border-radius);
  background: var(--theme--background-subdued, rgba(0, 0, 0, 0.1));
  font-size: 13px;
}

.detail-hint {
  margin: 0 0 8px 0;
  opacity: 0.85;
}

.occurrence-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.occurrence {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.occurrence-where code {
  font-family: var(--theme--fonts--monospace--font-family, monospace);
}

.occurrence-langs {
  opacity: 0.75;
  margin-left: 4px;
}

.occurrence-link,
.localazy-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  text-decoration: underline;
  color: inherit;
}

.detail-empty {
  margin: 0;
  opacity: 0.85;
}

.detail-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--theme--border-color-subdued, rgba(0, 0, 0, 0.1));
}

.detail-note {
  opacity: 0.75;
}
</style>
