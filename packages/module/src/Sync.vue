<template>
  <private-view title="Import & Export" icon="translate">
    <template #headline>
      <v-breadcrumb :items="[{ name: 'Localazy', to: '/localazy' }]" />
    </template>

    <template #navigation>
      <Navigation />
    </template>

    <template #actions>
      <sync-action-buttons
        :has-changes="hasChanges"
        :disable-sync="!someTranslatableFieldsChecked && !synchronizeTranslationStrings"
        @upload="onExport('incremental')"
        @upload-full="onExport('full')"
        @download="onImport('incremental')"
        @download-full="onImport('full')"
        @save-settings="onSaveSettings({ notify: true })"
      />
    </template>

    <div class="panel">
      <config-notice class="notice" :has-incomplete-configuration="hasIncompleteConfiguration" />
      <errors-notice class="notice" :localazy-data="localazyData" />

      <div
        v-if="lastSyncBanner"
        class="last-sync-banner"
        role="button"
        tabindex="0"
        @click="onOpenLastSession"
        @keyup.enter="onOpenLastSession"
      >
        <v-icon name="history" small />
        <span class="last-sync-text">{{ lastSyncBanner }}</span>
        <v-icon name="chevron_right" small class="last-sync-chevron" />
      </div>

      <sync-option-buttons
        v-model:show-untranslatable-field="showUntranslatableField"
        v-model:show-untranslatable-collections="showUntranslatableCollections"
        :all-translatable-fields-checked="allTranslatableFieldsChecked"
        :some-translatable-fields-checked="someTranslatableFieldsChecked"
        @select-all="selectAll"
        @deselect-all="deselectAll"
      />

      <div class="search-row">
        <v-input
          v-model="searchQuery"
          class="search-input"
          placeholder="Search collections and fields"
          :nullable="false"
          @keydown.esc="clearSearch"
        >
          <template #prepend>
            <v-icon name="search" class="search-icon" />
          </template>
          <template #append>
            <v-icon v-if="isSearchActive" name="close" clickable class="clear-icon" @click="clearSearch" />
          </template>
        </v-input>
      </div>

      <div v-if="installed" class="page">
        <div v-if="isSearchActive && !hasAnyVisibleTreeNode && !translationStringsVisible" class="empty-results">
          <p class="empty-results-title">No collections or fields match “{{ searchQuery }}”.</p>
          <p v-if="suggestEnablingToggles" class="empty-results-hint">
            Try a different search term, or open
            <span class="empty-results-options">Options</span> to enable
            <span v-if="!showUntranslatableField">“Show untranslatable fields”</span>
            <span v-if="!showUntranslatableField && !showUntranslatableCollections"> and </span>
            <span v-if="!showUntranslatableCollections">“Show collections without translatable fields”</span>.
          </p>
        </div>

        <div class="collection-list">
          <collection-item
            v-for="col in iteratedCollections"
            :key="col.collection"
            :collection="col"
            :translatable-collections="translatableCollections"
            :collections="collections"
            :selections="enabledFields"
            :show-untranslatable-field="showUntranslatableField"
            :show-untranslatable-collections="showUntranslatableCollections"
            :normalized-query="normalizedQuery"
            @update:selections="enabledFields = $event"
          />
        </div>

        <translation-strings-content
          v-if="translationStringsVisible"
          v-model:should-synchronize="synchronizeTranslationStrings"
          :normalized-query="normalizedQuery"
          :class="{
            'translation-strings-separator': hasAnyVisibleTreeNode,
          }"
        />
      </div>

      <progress-tracker-modal
        v-model:show-progress="showProgress"
        :loading="loading"
        :progress-tracker="progressTracker"
        @finish="onFinishAction"
      />
    </div>
  </private-view>
</template>

<script lang="ts" setup>
import { computed, onBeforeMount, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import Navigation from './components/Navigation.vue';
import CollectionItem from './components/Sync/CollectionItem.vue';
import { useCollectionsOrganizer } from './composables/use-collections-organizer';
import { useGetFieldsForTranslationRelation } from './composables/use-get-fields-for-translation-relation';
import SyncActionButtons from './components/Sync/SyncActionButtons.vue';
import SyncOptionButtons from './components/Sync/SyncOptionButtons.vue';
import ProgressTrackerModal from './components/Modals/ProgressTrackerModal.vue';
import ErrorsNotice from './components/ErrorsNotice.vue';
import ConfigNotice from './components/ConfigNotice.vue';
import { useProgressTrackerStore } from './stores/progress-tracker-store';
import TranslationStringsContent from './components/Sync/TranslationStringsContent.vue';
import { useSyncContainerActions } from './composables/use-sync-container-actions';
import { useLocalazyTransferSetupStore } from './stores/localazy-transfer-setup-store';
import { useLocalazyConfigurationStatus } from './composables/use-localazy-configuration-status';
import { useLocalazyBoot } from './composables/use-localazy-boot';
import { useLocalazySyncLogStore } from './stores/localazy-sync-log-store';
import { useDirectusUserStore } from './composables/use-directus-stores';
import { formatEventType, formatInitiator } from './composables/use-activity-log';
import { EnabledField } from '@localazy/directus-common';
import { EnabledFieldsService } from '@localazy/directus-common';
import { defaultConfiguration } from './data/default-configuration';
import { useRouter } from 'vue-router';
import { useTreeSearch } from './composables/use-tree-search';
import {
  buildVisibleTranslatableSelection,
  isCollectionShown,
  subtractEnabledFields,
  unionEnabledFields,
  VisibilityContext,
} from './composables/tree-visibility';

const { translatableRootCollections, rootCollections, translatableCollections, collections } = useCollectionsOrganizer();
const { getTranslatableFields } = useGetFieldsForTranslationRelation();
const { progressTracker } = storeToRefs(useProgressTrackerStore());

const showUntranslatableField = ref(false);
const showUntranslatableCollections = ref(false);

// Editable sync-container state, seeded from the transfer-setup store. The watch
// reseats the working copy whenever the persisted setup changes — initial load,
// post-save reload, or a rare cross-tab edit.
const { data: transferSetup } = storeToRefs(useLocalazyTransferSetupStore());
const enabledFields = ref<EnabledField[]>([]);
const synchronizeTranslationStrings = ref(defaultConfiguration().content_transfer_setup.translation_strings);
watch(
  transferSetup,
  (setup) => {
    try {
      enabledFields.value = EnabledFieldsService.parseFromDatabase(setup.enabled_fields);
    } catch {
      enabledFields.value = [];
    }
    synchronizeTranslationStrings.value = setup.translation_strings;
  },
  { immediate: true, deep: true },
);

const { onSaveSettings, onExport, onImport, onFinishAction, showProgress, loading, hasChanges } = useSyncContainerActions({
  enabledFields,
  synchronizeTranslationStrings,
});

const { installed, localazyData, boot } = useLocalazyBoot();
const { hasIncompleteConfiguration } = useLocalazyConfigurationStatus();

const router = useRouter();
const syncLogStore = useLocalazySyncLogStore();
const { sessions: syncLogSessions } = storeToRefs(syncLogStore);
const directusUserStore = useDirectusUserStore();

/**
 * Resolve a Directus user id to a display name. Only the current logged-in user is
 * reachable from `useUserStore()` without an extra `/users` round-trip — enough for the
 * common case (the operator who triggered this run is also viewing this page). For any
 * other user id, `formatInitiator` falls back to the generic "Triggered by user" label.
 */
function lookupUserName(userId: string): string | null {
  const current = directusUserStore.currentUser;
  if (!current || current.id !== userId) return null;
  const name = [current.first_name, current.last_name].filter(Boolean).join(' ').trim();
  if (name) return name;
  return current.email ?? null;
}

/**
 * Most recent sync log session, used for the "Last sync" banner below the notices.
 * Sessions arrive sorted by `started_at desc` from the store; the first one is the
 * latest. Falls back to `null` when the table is empty (fresh install).
 */
const lastSession = computed(() => syncLogSessions.value[0] ?? null);

const lastSyncBanner = computed(() => {
  const last = lastSession.value;
  if (!last) return null;
  // Sync state's `last_sync_at` is the cursor-flush touch; the log row's started_at is
  // the run boundary. Prefer the log row when we have it — it's the surface the
  // Activity page also renders against, so the two stay consistent.
  const startedMs = Date.parse(last.started_at);
  const finishedMs = last.finished_at ? Date.parse(last.finished_at) : null;
  const startStr = Number.isFinite(startedMs) ? new Date(startedMs).toLocaleString() : last.started_at;
  const durationStr =
    finishedMs && Number.isFinite(finishedMs) && Number.isFinite(startedMs) ? `${((finishedMs - startedMs) / 1000).toFixed(1)}s` : null;

  // Initiator + event-type rendering: for webhook flows the initiator already implies
  // the event_type, so we drop the redundant "Webhook" label in that case. UI flows
  // render both ("Triggered by Alice — Incremental download").
  const initiatorLabel = formatInitiator(last.initiator, lookupUserName);
  const eventTypeLabel = last.initiator === 'webhook' ? null : formatEventType(last.event_type);
  const headlineSuffix = eventTypeLabel ? `${initiatorLabel} — ${eventTypeLabel}` : initiatorLabel;

  const parts = [`Last sync: ${startStr}`, `(${headlineSuffix}, ${last.items_processed} items${durationStr ? `, ${durationStr}` : ''})`];
  parts.push(`— ${last.status}`);
  return parts.join(' ');
});

function onOpenLastSession() {
  if (!lastSession.value) return;
  void router.push(`/localazy/activity/${lastSession.value.id}`);
}

onBeforeMount(() => {
  // Errors land in the errors store inside `boot()`; no need to await or handle here.
  void boot();
  // Reload the sync log so the banner reflects the latest session whenever the
  // user lands here — covers the "ran a sync, navigated away, came back" case.
  void syncLogStore.reload();
});

const iteratedCollections = computed(() =>
  showUntranslatableCollections.value ? rootCollections.value : translatableRootCollections.value,
);

// Search lens (ADR-0003) — transient page-local state; resets on every visit.
const { query: searchQuery, normalizedQuery, isActive: isSearchActive, clear: clearSearch } = useTreeSearch();

// Translation Strings label string is duplicated in TranslationStringsContent.vue —
// keep both in sync if one moves.
const TRANSLATION_STRINGS_LABEL = 'Translation Strings';

const visibilityContext = computed<VisibilityContext>(() => ({
  isActive: isSearchActive.value,
  isMatch: (label: string) => (normalizedQuery.value.length === 0 ? true : label.toLowerCase().includes(normalizedQuery.value)),
  allCollections: collections.value,
  getFieldsForCollection: getTranslatableFields,
  showUntranslatableField: showUntranslatableField.value,
  showUntranslatableCollections: showUntranslatableCollections.value,
  isTranslatableCollection: (c) => translatableCollections.value.some((tc) => tc.collection === c.collection),
}));

const allTranslatableFields = computed(() =>
  translatableCollections.value.map((c) => ({
    collection: c.collection,
    fields: getTranslatableFields(c.collection).translatableFields.map((f) => f.field),
  })),
);

// Visible-only translatable selection, used by the scope-additive Select all
// path and by the master-checkbox state under an active lens.
const visibleTranslatableSelection = computed(() => buildVisibleTranslatableSelection(iteratedCollections.value, visibilityContext.value));

const hasAnyVisibleTreeNode = computed(() => iteratedCollections.value.some((c) => isCollectionShown(c, visibilityContext.value)));

const translationStringsVisible = computed(() => !isSearchActive.value || visibilityContext.value.isMatch(TRANSLATION_STRINGS_LABEL));

const suggestEnablingToggles = computed(() => !showUntranslatableField.value || !showUntranslatableCollections.value);

// Master-checkbox state: under a lens, scope to the visible subset; otherwise
// keep the original "every translatable field globally" rule.
const someTranslatableFieldsChecked = computed(() => {
  if (!isSearchActive.value) return enabledFields.value.length > 0;
  const visible = visibleTranslatableSelection.value;
  return visible.some((entry) =>
    entry.fields.some((field) => enabledFields.value.find((e) => e.collection === entry.collection)?.fields.includes(field)),
  );
});

const allTranslatableFieldsChecked = computed(() => {
  if (!isSearchActive.value) return enabledFields.value.length === allTranslatableFields.value.length;
  const visible = visibleTranslatableSelection.value;
  if (visible.length === 0) return false;
  return visible.every((entry) => {
    const current = enabledFields.value.find((e) => e.collection === entry.collection);
    return !!current && entry.fields.every((f) => current.fields.includes(f));
  });
});

function selectAll() {
  if (!isSearchActive.value) {
    enabledFields.value = allTranslatableFields.value;
    synchronizeTranslationStrings.value = true;
    return;
  }
  // Lens-scoped, additive (ADR-0003): preserve selections outside the visible set.
  enabledFields.value = unionEnabledFields(enabledFields.value, visibleTranslatableSelection.value);
  if (translationStringsVisible.value) synchronizeTranslationStrings.value = true;
}

function deselectAll() {
  if (!isSearchActive.value) {
    enabledFields.value = [];
    synchronizeTranslationStrings.value = false;
    return;
  }
  enabledFields.value = subtractEnabledFields(enabledFields.value, visibleTranslatableSelection.value);
  if (translationStringsVisible.value) synchronizeTranslationStrings.value = false;
}
</script>

<style lang="scss" scoped>
@use './styles/mixins/page' as *;
@use './styles/mixins/private-view' as *;

@include private-view-header;

.page {
  @include page;
}

.panel {
  padding: var(--content-padding);
  padding-top: 0;

  .collection-list {
    margin-top: 20px;
  }
}
.notice {
  margin-top: 20px;
  margin-bottom: 20px;
}

.translation-strings-separator {
  padding-top: 8px;
  margin-top: 8px;
  border-top: 1px solid var(--theme--border-color);
}

.search-row {
  margin-top: 16px;

  .search-input {
    width: 100%;
    /* Directus' v-input reads its border from --v-input-border-color and the
       hover / focus variants below. Without these, the input renders borderless
       in both modes. Resting uses the theme's regular border (not the subdued
       one — it needs to read as an interactive field, not a panel divider);
       hover bumps it to accent; focus picks up the brand colour. */
    --v-input-border-color: var(--theme--border-color);
    --v-input-border-color-hover: var(--theme--border-color-accent);
    --v-input-border-color-focus: var(--theme--primary);
  }

  .search-icon {
    color: var(--theme--foreground);
  }

  .clear-icon {
    color: var(--theme--foreground);
    &:hover {
      color: var(--theme--primary);
    }
  }
}

.empty-results {
  margin: 16px 0;
  padding: 16px;
  background-color: var(--theme--background-subdued);
  border: 1px dashed var(--theme--border-color-subdued);
  border-radius: var(--theme--border-radius);
  color: var(--theme--foreground);
  font-size: 13px;

  .empty-results-title {
    margin: 0 0 4px 0;
    font-weight: 500;
    color: var(--theme--foreground);
  }

  .empty-results-hint {
    margin: 0;
  }

  .empty-results-options {
    font-weight: 500;
    color: var(--theme--foreground);
  }
}

.last-sync-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  margin-top: 12px;
  margin-bottom: 12px;
  background-color: var(--theme--background-subdued);
  border: 1px solid var(--theme--border-color-subdued);
  border-radius: var(--theme--border-radius);
  cursor: pointer;
  font-size: 13px;
  color: var(--theme--foreground);
  transition: background-color var(--fast) var(--transition);

  &:hover,
  &:focus {
    background-color: var(--theme--background-normal);
    color: var(--theme--foreground);
    outline: none;
  }

  .last-sync-text {
    flex: 1;
  }

  .last-sync-chevron {
    opacity: 0.6;
  }
}
</style>
