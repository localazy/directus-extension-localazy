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
        <v-icon name="info" small />
        <span>Last 100 sync sessions are retained. Older sessions are automatically deleted.</span>
      </div>

      <v-notice v-if="clearedNotice" type="success" class="cleared-notice"> Activity logs cleared. </v-notice>

      <div class="filters">
        <div class="filter-field status-field">
          <label class="filter-label">Status</label>
          <v-select v-model="statusFilter" :items="STATUS_OPTIONS" multiple placeholder="All statuses" />
        </div>
        <div class="filter-field initiator-field">
          <label class="filter-label">Triggered by</label>
          <v-select v-model="initiatorFilter" :items="INITIATOR_OPTIONS" multiple placeholder="All triggers" />
        </div>
        <div class="date-range">
          <div class="filter-field">
            <label class="filter-label">From</label>
            <interface-datetime type="date" :value="dateFromValue" :include-seconds="false" @input="onDateFromInput" />
          </div>
          <div class="filter-field">
            <label class="filter-label">To</label>
            <interface-datetime type="date" :value="dateToValue" :include-seconds="false" @input="onDateToInput" />
          </div>
        </div>
      </div>

      <div class="sessions-tabs">
        <v-tabs v-model="activeTabModel">
          <v-tab value="upload">Export</v-tab>
          <v-tab value="download">Import</v-tab>
        </v-tabs>
      </div>

      <div class="sessions-card">
        <sessions-table
          :rows="paginatedSessions"
          :current-sort="currentSort"
          :page="page"
          :total-pages="totalPages"
          :tab="activeTab"
          :lookup-user-name="lookupUserName"
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
import { computed, onBeforeMount, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import Navigation from './components/Navigation.vue';
import SessionsTable from './components/Activity/SessionsTable.vue';
import { useLocalazyBoot } from './composables/use-localazy-boot';
import { useLocalazySyncLogStore } from './stores/localazy-sync-log-store';
import { useLocalazySettingsStore } from './stores/localazy-settings-store';
import { useSyncLogUserNames } from './composables/use-sync-log-user-names';
import {
  parseSortPreferences,
  serializeSortPreferences,
  useActivityLog,
  type ActivityTab,
  type SortPreferences,
} from './composables/use-activity-log';

const router = useRouter();
const route = useRoute();

// Boot: ensures the installer's heal step runs so the `localazy_sync_log` collection
// (added in PR D) lands on already-installed instances. The list store reload is
// gated on `installer.installed` internally — no extra wiring needed here.
const { boot } = useLocalazyBoot();

const syncLogStore = useLocalazySyncLogStore();
const { sessions } = storeToRefs(syncLogStore);

// Resolve Directus user names for each row's initiator id so the table shows
// "Triggered by Jane Doe" instead of a raw UUID. Watches `sessions` and batches
// one `/users?filter[id][_in]=...` fetch per fresh set of ids.
const { lookupUserName } = useSyncLogUserNames(sessions);

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

const {
  activeTab,
  statusFilter,
  initiatorFilter,
  dateFrom,
  dateTo,
  page,
  totalPages,
  currentSort,
  setSort,
  filteredSessions,
  paginatedSessions,
} = useActivityLog({
  sessions,
  initialSortPreferences,
  onSortPreferencesChange,
});

// Persist the active tab in the URL hash so a reload (or a copied link) lands on
// the same tab. Restore on first mount; mirror future changes via `router.replace`
// so tab switches don't pollute the browser history.
const VALID_TAB_HASHES: readonly ActivityTab[] = ['upload', 'download'];
function tabFromHash(hash: string): ActivityTab | null {
  const value = hash.replace(/^#/, '');
  return (VALID_TAB_HASHES as readonly string[]).includes(value) ? (value as ActivityTab) : null;
}
const initialTabFromHash = tabFromHash(route.hash);
if (initialTabFromHash) activeTab.value = initialTabFromHash;
watch(activeTab, (next) => {
  if (route.hash === `#${next}`) return;
  void router.replace({ hash: `#${next}` });
});

// `<v-select :items>` shape: `{ text, value }`. The statuses mirror StatusLabel.vue's
// known set; an unknown status read from disk still passes through the filter (the
// select just won't offer it as a checkbox option, which is fine — Strapi parity).
const STATUS_OPTIONS = [
  { text: 'Completed', value: 'completed' },
  { text: 'Completed (errors)', value: 'partial' },
  { text: 'Failed', value: 'failed' },
  { text: 'Aborted', value: 'aborted' },
  { text: 'Skipped', value: 'skipped' },
  { text: 'In progress', value: 'in_progress' },
];

// Two-way classification — see `classifyInitiator` in use-activity-log.ts. "Automation"
// covers hook bursts (`initiator='hook'`) and inbound webhooks (`initiator='webhook'`);
// "User" covers UI-triggered runs (Directus user-id initiators). Option text uses
// nouns rather than adjectives so the "Triggered by: <option>" phrasing reads
// naturally in the dropdown context. The persisted `InitiatorKind` value
// ('automated'/'manual') stays unchanged.
const INITIATOR_OPTIONS = [
  { text: 'Automation', value: 'automated' },
  { text: 'User', value: 'manual' },
];

// Directus' `<v-tabs>` is declared as a single-select group (`multiple: false`) but
// its emit on `update:modelValue` still produces a one-element ARRAY (`["download"]`)
// rather than the unwrapped string. Without the `Array.isArray` unwrap, clicking a
// tab sets `activeTab` to `["download"]`, the `tabForEventType(...) !== activeTab`
// check fails for every row (string vs. array comparison), and the table empties.
// Accepting both shapes here keeps the composable's `ActivityTab` union intact.
const activeTabModel = computed<string | string[]>({
  get: () => activeTab.value,
  set: (v: string | string[]) => {
    const next = Array.isArray(v) ? v[0] : v;
    if (next) activeTab.value = next as ActivityTab;
  },
});

// `<interface-datetime type="date">` parses its value with date-fns `parse(value, 'yyyy-MM-dd', new Date)`.
// Passing a full ISO string makes the value-display branch render `<!---->` (empty activator),
// and triggers the "default" behaviour described as "calendar shows no value". The bridges
// therefore round-trip `yyyy-MM-dd` strings — the filter helpers still consume `Date`
// objects (UTC midnight matches `filterSessions`' UTC-based cutoffs).
function toIsoDate(d: Date): string {
  const yyyy = String(d.getUTCFullYear()).padStart(4, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
const dateFromValue = computed(() => (dateFrom.value ? toIsoDate(dateFrom.value) : null));
const dateToValue = computed(() => (dateTo.value ? toIsoDate(dateTo.value) : null));

function parseIsoDate(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return undefined;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}
function onDateFromInput(value: string | null) {
  dateFrom.value = value ? parseIsoDate(value) : undefined;
}
function onDateToInput(value: string | null) {
  dateTo.value = value ? parseIsoDate(value) : undefined;
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
  color: var(--theme--foreground-subdued);
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
  align-items: flex-end;
}

.filter-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 160px;
}

.status-field {
  flex: 1;
  min-width: 240px;
  /* Match the date picker's 40px activator height — Directus form components
     pick this variable up from the surrounding scope. */
  --theme--form--field--input--height: 40px;
}

.initiator-field {
  flex: 0 0 200px;
  min-width: 200px;
  --theme--form--field--input--height: 40px;
}

.filter-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--theme--foreground-subdued);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.date-range {
  display: flex;
  gap: 12px;
}

/* Tabs sit on the page background — only the active label gets recolored. The
   default Directus active-tab color shift was too subtle, so we promote it to
   `--primary` and bump weight; no card, no underline strip. */
.sessions-tabs :deep(.v-tab.active) {
  color: var(--theme--primary);
  font-weight: 600;
}

/* Card wrapping just the session list (table or empty state) so the logs area
   has its own surface separate from the tabs above. */
.sessions-card {
  background-color: var(--theme--background-normal);
  border: 1px solid var(--theme--border-color-subdued);
  border-radius: var(--theme--border-radius);
  overflow: hidden;
}
</style>
