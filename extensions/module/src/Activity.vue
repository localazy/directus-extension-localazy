<template>
  <private-view title="Activity" icon="history">
    <template #headline>
      <v-breadcrumb :items="[{ name: 'Localazy', to: '/localazy' }]" />
    </template>

    <template #navigation>
      <Navigation />
    </template>

    <template #actions>
      <div class="header-actions">
        <v-button secondary small :disabled="filteredSessions.length === 0" @click="onExport">
          <v-icon name="download" left />
          Export logs
        </v-button>
        <v-button kind="warning" small :disabled="sessions.length === 0" @click="showClearDialog = true">
          <v-icon name="delete" left />
          Clear logs
        </v-button>
      </div>
    </template>

    <div class="panel">
      <div class="retention-note">
        <v-icon name="info_outline" small />
        <span>Last 100 sync sessions are retained. Older sessions are automatically deleted.</span>
      </div>

      <v-notice v-if="clearedNotice" type="success" class="cleared-notice"> Activity logs cleared. </v-notice>

      <div class="filters">
        <v-input v-model="searchValue" placeholder="Search by summary, initiator, status, or date" class="search-input" />
        <interface-datetime type="date" :value="dateFromValue" :include-seconds="false" @input="onDateFromInput" />
        <interface-datetime type="date" :value="dateToValue" :include-seconds="false" @input="onDateToInput" />
      </div>

      <v-tabs v-model="activeTabModel">
        <v-tab value="upload">Upload</v-tab>
        <v-tab value="download">Download</v-tab>
        <v-tab value="webhook">Webhooks</v-tab>
      </v-tabs>

      <div class="tab-content">
        <sessions-table
          :rows="paginatedSessions"
          :current-sort="currentSort"
          :page="page"
          :total-pages="totalPages"
          @sort="setSort"
          @select="onSessionClick"
          @update:page="page = $event"
        />
      </div>
    </div>

    <v-dialog v-model="showClearDialog" @esc="showClearDialog = false">
      <v-card>
        <v-card-title>Clear activity logs?</v-card-title>
        <v-card-text> This removes every sync session record. The action cannot be undone. </v-card-text>
        <v-card-actions>
          <v-button secondary @click="showClearDialog = false">Cancel</v-button>
          <v-button kind="warning" :loading="clearing" @click="onClearLogs">Clear logs</v-button>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </private-view>
</template>

<script lang="ts" setup>
import { computed, onBeforeMount, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import Navigation from './components/Navigation.vue';
import SessionsTable from './components/Activity/SessionsTable.vue';
import { useLocalazyBoot } from './composables/use-localazy-boot';
import { useLocalazySyncLogStore } from './stores/localazy-sync-log-store';
import { useLocalazySettingsStore } from './stores/localazy-settings-store';
import {
  parseSortPreferences,
  serializeSortPreferences,
  useActivityLog,
  type ActivityTab,
  type SortPreferences,
} from './composables/use-activity-log';

const router = useRouter();

// Boot: ensures the installer's heal step runs so the `localazy_sync_log` collection
// (added in PR D) lands on already-installed instances. The list store reload is
// gated on `installer.installed` internally — no extra wiring needed here.
const { boot } = useLocalazyBoot();

const syncLogStore = useLocalazySyncLogStore();
const { sessions } = storeToRefs(syncLogStore);

const settingsStore = useLocalazySettingsStore();
const { data: settings } = storeToRefs(settingsStore);
const initialSortPreferences = computed<SortPreferences>(() => parseSortPreferences(settings.value.activity_logs_sort));

// Save sort prefs back to settings. Debounced so a rapid toggle (clicking the same
// header to reverse direction back and forth) doesn't fire one PATCH per click.
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function onSortPreferencesChange(next: SortPreferences) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void settingsStore.save({ activity_logs_sort: serializeSortPreferences(next) });
  }, 600);
}

const { activeTab, searchInput, dateFrom, dateTo, page, totalPages, currentSort, setSort, filteredSessions, paginatedSessions, setSearch } =
  useActivityLog({
    sessions,
    initialSortPreferences,
    onSortPreferencesChange,
  });

const searchValue = computed({
  get: () => searchInput.value,
  set: (v: string) => setSearch(v),
});

// `<v-tabs>` model-value is a string; the composable uses a constrained `ActivityTab`
// union. Bridge through a computed so the cast happens in one place.
const activeTabModel = computed<string>({
  get: () => activeTab.value,
  set: (v: string) => {
    activeTab.value = v as ActivityTab;
  },
});

// `<interface-datetime>` returns ISO strings; the filter helpers consume `Date` objects
// (or `undefined` for "no filter"). The bridges normalise both sides.
const dateFromValue = computed(() => (dateFrom.value ? dateFrom.value.toISOString() : null));
const dateToValue = computed(() => (dateTo.value ? dateTo.value.toISOString() : null));

function onDateFromInput(value: string | null) {
  dateFrom.value = value ? new Date(value) : undefined;
}
function onDateToInput(value: string | null) {
  dateTo.value = value ? new Date(value) : undefined;
}

const showClearDialog = ref(false);
const clearing = ref(false);
const clearedNotice = ref(false);

async function onClearLogs() {
  clearing.value = true;
  try {
    await syncLogStore.clearAll();
    showClearDialog.value = false;
    clearedNotice.value = true;
    setTimeout(() => {
      clearedNotice.value = false;
    }, 3000);
  } finally {
    clearing.value = false;
  }
}

function onExport() {
  // Export the currently-visible (filtered) set, not the entire store, so the
  // download mirrors what the user sees on screen. Mirrors Strapi's behaviour.
  const payload = JSON.stringify(filteredSessions.value, null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `localazy-activity-logs-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function onSessionClick(sessionId: string) {
  void router.push(`/localazy/activity/${sessionId}`);
}

// Reload the list when the user returns to the page — covers the "ran a sync in
// another tab, navigated back to Activity" case.
onBeforeMount(() => {
  void boot();
  void syncLogStore.reload();
});
</script>

<style lang="scss" scoped>
.panel {
  padding: var(--content-padding);
  padding-top: 0;
  padding-bottom: var(--content-padding-bottom);
}

.header-actions {
  display: flex;
  gap: 8px;
}

.retention-note {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--foreground-subdued);
  font-size: 13px;
  margin-bottom: 16px;
}

.cleared-notice {
  margin-bottom: 16px;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
  align-items: center;

  .search-input {
    flex: 1;
    min-width: 240px;
  }
}

.tab-content {
  margin-top: 16px;
}
</style>
