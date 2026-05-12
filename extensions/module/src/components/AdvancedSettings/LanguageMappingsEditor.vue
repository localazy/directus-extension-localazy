<template>
  <div class="language-mappings">
    <v-divider :inline-title="false" large>Custom language mappings</v-divider>

    <p class="note description">
      Define custom mappings between Directus and Localazy language codes. Use this when the default transformation isn't enough — e.g.,
      Directus's <code>zh-Hans</code> needs to map to Localazy's <code>zh-CN#Hans</code>.
    </p>

    <div v-if="parsedMappings.length > 0" class="mappings-list">
      <div class="mapping-row header">
        <span class="type-label">Directus code</span>
        <span class="type-label">Localazy code</span>
        <span class="type-label">Actions</span>
      </div>
      <div v-for="(mapping, index) in parsedMappings" :key="index" class="mapping-row">
        <v-input v-model="mapping.directusCode" placeholder="e.g., zh-Hans" @update:model-value="emitChange" />
        <v-input v-model="mapping.localazyCode" placeholder="e.g., zh-CN#Hans" @update:model-value="emitChange" />
        <v-button icon rounded secondary @click="removeMapping(index)">
          <v-icon name="delete" />
        </v-button>
      </div>
    </div>

    <div v-else class="empty-state">
      <p class="note">No custom mappings configured. Default behaviour swaps <code>-</code> and <code>_</code> in both directions.</p>
    </div>

    <v-button class="add-button" secondary @click="addMapping">
      <v-icon name="add" left />
      Add mapping
    </v-button>

    <div v-if="validationErrors.length > 0" class="validation-errors">
      <v-notice type="danger">
        <ul>
          <li v-for="error in validationErrors" :key="error">{{ error }}</li>
        </ul>
      </v-notice>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue';
import { LanguageMappings } from '../../../../common/models/language-mapping';
import { LanguageMappingService } from '../../../../common/services/language-mapping-service';

const props = defineProps({
  modelValue: {
    type: String,
    default: '[]',
  },
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

const parsedMappings = ref<LanguageMappings>([]);
const validationErrors = ref<string[]>([]);

watch(
  () => props.modelValue,
  (value) => {
    try {
      parsedMappings.value = JSON.parse(value || '[]') as LanguageMappings;
    } catch {
      parsedMappings.value = [];
    }
  },
  { immediate: true },
);

function emitChange() {
  const json = JSON.stringify(parsedMappings.value);
  const validation = LanguageMappingService.validateMappings(json);
  validationErrors.value = validation.errors;
  emit('update:modelValue', json);
}

function addMapping() {
  parsedMappings.value.push({ directusCode: '', localazyCode: '' });
  emitChange();
}

function removeMapping(index: number) {
  parsedMappings.value.splice(index, 1);
  emitChange();
}
</script>

<style lang="scss" scoped>
.language-mappings {
  grid-column-start: 1;
  grid-column-end: 3;
  margin-top: 40px;
}

.description {
  margin-bottom: 20px;
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
  align-items: center;

  &.header {
    margin-bottom: 8px;
  }
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

.validation-errors {
  margin-top: 12px;

  ul {
    margin: 0;
    padding-left: 20px;
  }
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
