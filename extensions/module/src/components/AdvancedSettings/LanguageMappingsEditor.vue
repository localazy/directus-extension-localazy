<template>
  <div class="language-mappings">
    <v-divider :inline-title="false" large>Custom language mappings</v-divider>

    <div class="description">
      <p class="note">
        Define custom mappings between Directus and Localazy language codes. Use this when the default transformation isn't enough — e.g.,
        Directus's <code>zh-Hans</code> needs to map to Localazy's <code>zh-CN#Hans</code>.
      </p>
      <p class="note">
        Pick the Directus language from your configured collection, and the matching Localazy locale from the supported list.
      </p>
    </div>

    <v-notice v-if="!isConfigured" type="info">
      Configure the Directus languages collection in the
      <router-link to="/localazy/project-setup">Project setup page</router-link>
      before defining custom mappings.
    </v-notice>

    <template v-else>
      <div v-if="rows.length > 0" class="mappings-list">
        <div class="mapping-row header">
          <span class="type-label">Directus code</span>
          <span class="type-label">Localazy code</span>
          <span class="type-label actions-header">Actions</span>
        </div>

        <div v-for="row in rows" :key="row.id" class="mapping-row" :class="{ 'is-editing': row.editing !== null }">
          <template v-if="row.editing !== null">
            <div class="field-cell">
              <v-select
                v-model="row.editing.directusCode"
                :items="directusOptionsForRow(row)"
                placeholder="Select Directus language"
                :class="{ 'has-error': showError(row, 'directusCode') }"
                @update:model-value="onFieldChange(row, 'directusCode')"
              />
              <p v-if="showError(row, 'directusCode')" class="field-error">{{ row.errors.directusCode }}</p>
            </div>
            <div class="field-cell">
              <v-select
                v-model="row.editing.localazyCode"
                :items="localazyOptionsForRow(row)"
                placeholder="Select Localazy locale"
                :class="{ 'has-error': showError(row, 'localazyCode') }"
                @update:model-value="onFieldChange(row, 'localazyCode')"
              />
              <p v-if="showError(row, 'localazyCode')" class="field-error">{{ row.errors.localazyCode }}</p>
            </div>
            <div class="actions">
              <v-button v-tooltip="'Cancel'" icon rounded secondary @click="cancelEdit(row)">
                <v-icon name="close" />
              </v-button>
              <v-button v-tooltip="'Save'" icon rounded :disabled="!isRowValid(row)" @click="saveEdit(row)">
                <v-icon name="check" />
              </v-button>
            </div>
          </template>

          <template v-else>
            <div class="value-cell">
              <code>{{ row.saved!.directusCode }}</code>
              <v-icon
                v-if="isDirectusCodeStale(row.saved!.directusCode)"
                v-tooltip="'No longer present in the Directus languages collection'"
                name="warning"
                small
                class="stale-icon"
              />
            </div>
            <div class="value-cell">
              <code>{{ row.saved!.localazyCode }}</code>
              <v-icon
                v-if="isLocalazyCodeStale(row.saved!.localazyCode)"
                v-tooltip="'Not a known Localazy locale'"
                name="warning"
                small
                class="stale-icon"
              />
            </div>
            <div class="actions">
              <v-button v-tooltip="'Edit'" icon rounded secondary :disabled="isAnyEditing" @click="startEdit(row)">
                <v-icon name="edit" />
              </v-button>
              <v-button v-tooltip="'Delete'" icon rounded secondary :disabled="isAnyEditing" @click="removeRow(row)">
                <v-icon name="delete" />
              </v-button>
            </div>
          </template>
        </div>
      </div>

      <div v-else class="empty-state">
        <p class="note">No custom mappings configured. Default behaviour swaps <code>-</code> and <code>_</code> in both directions.</p>
      </div>

      <v-button class="add-button" secondary :disabled="isAnyEditing" @click="addMapping">
        <v-icon name="add" left />
        Add mapping
      </v-button>
    </template>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref, toRef, watch } from 'vue';
import { useItems } from '@directus/extensions-sdk';
import { Item } from '@directus/types';
import { getLocalazyLanguages } from '@localazy/languages';
import { LanguageMappings } from '../../../../common/models/language-mapping';
import { SelectItem } from '../../models/directus/internals/select-item';
import { formatLanguageOption, pickLanguageName } from '../../../../common/utilities/language-display';

type FieldKey = 'directusCode' | 'localazyCode';

type Codes = { directusCode: string; localazyCode: string };

type Row = {
  id: number;
  saved: Codes | null;
  editing: Codes | null;
  touched: Record<FieldKey, boolean>;
  errors: Record<FieldKey, string | null>;
};

const props = defineProps<{
  languageCollection: string;
  languageCodeField: string;
}>();

const modelValue = defineModel<string>({ default: '[]' });

const isConfigured = computed(() => !!props.languageCollection && !!props.languageCodeField);

const languageCollectionRef = toRef(props, 'languageCollection');

const { items: languageItems } = useItems(languageCollectionRef, {
  fields: ref(['*']),
  limit: ref(-1),
  sort: ref(null),
  search: ref(null),
  filter: ref(null),
  page: ref(null),
});

const directusCodeOptions = computed<SelectItem[]>(() => {
  if (!isConfigured.value || !languageItems.value) return [];
  const field = props.languageCodeField;
  return (languageItems.value as Item[])
    .map((item) => ({ code: item[field] as unknown, item }))
    .filter((entry): entry is { code: string; item: Item } => typeof entry.code === 'string' && entry.code.length > 0)
    .map(({ code, item }) => ({
      text: formatLanguageOption(code, pickLanguageName(item as Record<string, unknown>)),
      value: code,
    }));
});

const directusCodeSet = computed(() => new Set(directusCodeOptions.value.map((o) => o.value)));

const localazyCodeOptions = computed<SelectItem[]>(() =>
  getLocalazyLanguages()
    .map((lang) => ({ text: `${lang.name} (${lang.locale})`, value: lang.locale }))
    .sort((a, b) => a.text.localeCompare(b.text)),
);

const localazyCodeSet = computed(() => new Set(localazyCodeOptions.value.map((o) => o.value)));

let nextId = 1;
let lastEmitted: string | null = null;
const rows = ref<Row[]>([]);

const isAnyEditing = computed(() => rows.value.some((r) => r.editing !== null));

watch(
  modelValue,
  (value) => {
    if (value === lastEmitted) return;
    try {
      const parsed = JSON.parse(value || '[]') as LanguageMappings;
      rows.value = parsed.map((m) => createRow({ directusCode: m.directusCode, localazyCode: m.localazyCode }));
    } catch {
      rows.value = [];
    }
  },
  { immediate: true },
);

watch([directusCodeOptions, localazyCodeOptions], () => {
  rows.value.forEach((row) => {
    if (row.editing) validateRow(row);
  });
});

function createRow(saved: Codes | null): Row {
  return {
    id: nextId++,
    saved,
    editing: null,
    touched: { directusCode: false, localazyCode: false },
    errors: { directusCode: null, localazyCode: null },
  };
}

function startEdit(row: Row) {
  if (!row.saved || isAnyEditing.value) return;
  row.editing = { ...row.saved };
  row.touched = { directusCode: false, localazyCode: false };
  validateRow(row);
}

function cancelEdit(row: Row) {
  if (row.saved === null) {
    rows.value = rows.value.filter((r) => r.id !== row.id);
    return;
  }
  row.editing = null;
  row.touched = { directusCode: false, localazyCode: false };
  row.errors = { directusCode: null, localazyCode: null };
}

function saveEdit(row: Row) {
  if (!row.editing || !isRowValid(row)) return;
  row.saved = { ...row.editing };
  row.editing = null;
  row.touched = { directusCode: false, localazyCode: false };
  row.errors = { directusCode: null, localazyCode: null };
  emitChange();
}

function removeRow(row: Row) {
  rows.value = rows.value.filter((r) => r.id !== row.id);
  emitChange();
}

function addMapping() {
  if (isAnyEditing.value) return;
  const newRow = createRow(null);
  newRow.editing = { directusCode: '', localazyCode: '' };
  rows.value.push(newRow);
}

function onFieldChange(row: Row, field: FieldKey) {
  row.touched[field] = true;
  validateRow(row);
}

function validateRow(row: Row) {
  if (!row.editing) {
    row.errors = { directusCode: null, localazyCode: null };
    return;
  }
  row.errors = {
    directusCode: fieldError(row, 'directusCode'),
    localazyCode: fieldError(row, 'localazyCode'),
  };
}

function fieldError(row: Row, field: FieldKey): string | null {
  const value = row.editing![field];
  if (value === '' || value === null) {
    return field === 'directusCode' ? 'Select a Directus language' : 'Select a Localazy locale';
  }
  const duplicate = rows.value.some((other) => other.id !== row.id && effectiveCode(other, field) === value);
  if (duplicate) {
    const label = field === 'directusCode' ? 'Directus' : 'Localazy';
    return `Duplicate ${label} code "${value}"`;
  }
  return null;
}

function effectiveCode(row: Row, field: FieldKey): string | null {
  if (row.editing) return row.editing[field];
  if (row.saved) return row.saved[field];
  return null;
}

function showError(row: Row, field: FieldKey): boolean {
  return row.touched[field] && row.errors[field] !== null;
}

function isRowValid(row: Row): boolean {
  if (!row.editing) return false;
  return (
    row.errors.directusCode === null &&
    row.errors.localazyCode === null &&
    row.editing.directusCode !== '' &&
    row.editing.localazyCode !== ''
  );
}

function isDirectusCodeStale(code: string): boolean {
  return directusCodeOptions.value.length > 0 && !directusCodeSet.value.has(code);
}

function isLocalazyCodeStale(code: string): boolean {
  return !localazyCodeSet.value.has(code);
}

function directusOptionsForRow(row: Row): SelectItem[] {
  const opts = directusCodeOptions.value;
  const current = row.editing?.directusCode;
  if (current && !directusCodeSet.value.has(current)) {
    return [{ text: `${current} (no longer exists)`, value: current }, ...opts];
  }
  return opts;
}

function localazyOptionsForRow(row: Row): SelectItem[] {
  const opts = localazyCodeOptions.value;
  const current = row.editing?.localazyCode;
  if (current && !localazyCodeSet.value.has(current)) {
    return [{ text: `${current} (unknown locale)`, value: current }, ...opts];
  }
  return opts;
}

function emitChange() {
  const mappings: LanguageMappings = rows.value
    .filter((r) => r.saved !== null)
    .map((r) => ({ directusCode: r.saved!.directusCode, localazyCode: r.saved!.localazyCode }));
  const json = JSON.stringify(mappings);
  lastEmitted = json;
  modelValue.value = json;
}
</script>

<style lang="scss" scoped>
.language-mappings {
  grid-column-start: 1;
  grid-column-end: 3;
  margin-top: 40px;
}

.description {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
  margin-bottom: 24px;
}

.description .note {
  margin: 0;
}

.mappings-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 20px;
}

.mapping-row {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 12px;
  align-items: start;

  &.header {
    margin-bottom: 8px;
    align-items: center;
  }

  &:not(.is-editing):not(.header) {
    align-items: center;
  }
}

.actions-header {
  text-align: right;
}

.field-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-error {
  margin: 0;
  font-size: 13px;
  line-height: 18px;
  color: var(--danger);
}

.value-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
}

.stale-icon {
  color: var(--warning);
}

.actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.has-error :deep(.v-input),
.has-error :deep(.v-select) {
  border-color: var(--danger);
}

.empty-state {
  margin-bottom: 20px;
  padding: 20px;
  background: var(--background-subdued);
  border-radius: var(--border-radius);
}

.add-button {
  margin-bottom: 20px;
}

.note {
  font-style: italic;
  font-size: 13px;
  line-height: 18px;
  color: var(--foreground-normal);
}

code {
  background: var(--background-subdued);
  padding: 2px 6px;
  border-radius: var(--border-radius);
  font-family: var(--family-monospace);
}
</style>
