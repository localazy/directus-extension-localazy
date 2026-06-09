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
          <span class="type-label actions-header" aria-hidden="true"></span>
        </div>

        <div v-for="(row, index) in rows" :key="row.id" class="mapping-row">
          <div class="field-cell">
            <v-select
              v-model="row.directusCode"
              :items="directusOptionsForRow(row)"
              placeholder="Select Directus language"
              :class="{ 'has-error': fieldErrors(row, index).directusCode !== null }"
            />
            <p v-if="fieldErrors(row, index).directusCode" class="field-error">{{ fieldErrors(row, index).directusCode }}</p>
          </div>
          <div class="field-cell">
            <v-select
              v-model="row.localazyCode"
              :items="localazyOptionsForRow(row)"
              placeholder="Select Localazy locale"
              :class="{ 'has-error': fieldErrors(row, index).localazyCode !== null }"
            />
            <p v-if="fieldErrors(row, index).localazyCode" class="field-error">{{ fieldErrors(row, index).localazyCode }}</p>
          </div>
          <div class="actions">
            <v-button v-tooltip="'Remove mapping'" icon rounded secondary @click="removeRow(row.id)">
              <v-icon name="delete" />
            </v-button>
          </div>
        </div>
      </div>

      <div v-else class="empty-state">
        <p class="note">No custom mappings configured. Default behaviour swaps <code>-</code> and <code>_</code> in both directions.</p>
      </div>

      <v-button class="add-button" secondary @click="addMapping">
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
import { SelectItem } from '../../models/directus/internals/select-item';
import { formatLanguageOption, pickLanguageName } from '@localazy/directus-common';
import {
  parseLanguageMappings,
  serializeLanguageMappings,
  validateMappingRow,
  hasMappingErrors,
  type MappingCodes,
} from './language-mappings-form';

type Row = MappingCodes & { id: number };

const props = defineProps<{
  languageCollection: string;
  languageCodeField: string;
}>();

const modelValue = defineModel<string>({ default: '[]' });
const valid = defineModel<boolean>('valid', { default: true });

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

watch(
  modelValue,
  (value) => {
    if (value === lastEmitted) return;
    rows.value = parseLanguageMappings(value).map((m) => ({ id: nextId++, ...m }));
  },
  { immediate: true },
);

watch(
  rows,
  () => {
    emitChange();
  },
  { deep: true },
);

function fieldErrors(row: Row, index: number) {
  return validateMappingRow(row, rows.value, index);
}

function addMapping() {
  rows.value.push({ id: nextId++, directusCode: '', localazyCode: '' });
}

function removeRow(id: number) {
  rows.value = rows.value.filter((r) => r.id !== id);
}

function directusOptionsForRow(row: Row): SelectItem[] {
  const opts = directusCodeOptions.value;
  const current = row.directusCode;
  if (current && !directusCodeSet.value.has(current) && directusCodeOptions.value.length > 0) {
    return [{ text: `${current} (no longer exists)`, value: current }, ...opts];
  }
  return opts;
}

function localazyOptionsForRow(row: Row): SelectItem[] {
  const opts = localazyCodeOptions.value;
  const current = row.localazyCode;
  if (current && !localazyCodeSet.value.has(current)) {
    return [{ text: `${current} (unknown locale)`, value: current }, ...opts];
  }
  return opts;
}

function emitChange() {
  const json = serializeLanguageMappings(rows.value);
  valid.value = !hasMappingErrors(rows.value);
  if (json === modelValue.value) return;
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
  color: var(--theme--danger);
}

.actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding-top: 4px;
}

.has-error :deep(.v-input),
.has-error :deep(.v-select) {
  border-color: var(--theme--danger);
}

.empty-state {
  margin-bottom: 20px;
  padding: 20px;
  background: var(--theme--background-subdued);
  border-radius: var(--theme--border-radius);
}

.add-button {
  margin-bottom: 20px;
}

.note {
  font-style: italic;
  font-size: 13px;
  line-height: 18px;
  color: var(--theme--foreground);
}

code {
  background: var(--theme--background-subdued);
  padding: 2px 6px;
  border-radius: var(--theme--border-radius);
  font-family: var(--theme--fonts--monospace--font-family);
}
</style>
