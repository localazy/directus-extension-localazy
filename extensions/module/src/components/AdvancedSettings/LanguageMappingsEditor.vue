<template>
  <div class="language-mappings">
    <v-divider :inline-title="false" large>
      Custom Language Mappings
    </v-divider>

    <p class="note description">
      Define custom mappings between Directus and Localazy language codes.
      This is useful when language codes differ significantly
      (e.g., <code>zh-Hans</code> in Directus maps to <code>zh-CN#Hans</code> in Localazy).
    </p>

    <div class="mappings-list" v-if="parsedMappings.length > 0">
      <div class="mapping-row header">
        <span class="type-label">Directus Code</span>
        <span class="type-label">Localazy Code</span>
        <span class="type-label">Actions</span>
      </div>
      <div
        class="mapping-row"
        v-for="(mapping, index) in parsedMappings"
        :key="index"
      >
        <v-input
          v-model="mapping.directusCode"
          placeholder="e.g., zh-Hans"
          @update:model-value="emitChange"
        />
        <v-input
          v-model="mapping.localazyCode"
          placeholder="e.g., zh-CN#Hans"
          @update:model-value="emitChange"
        />
        <v-button
          icon
          rounded
          secondary
          @click="removeMapping(index)"
        >
          <v-icon name="delete" />
        </v-button>
      </div>
    </div>

    <div class="empty-state" v-else>
      <p class="note">No custom mappings configured. Default behavior uses simple character replacement
        (<code>-</code> to <code>_</code>).
      </p>
    </div>

    <v-button
      class="add-button"
      secondary
      @click="addMapping"
    >
      <v-icon name="add" left />
      Add Mapping
    </v-button>

    <div class="validation-errors" v-if="validationErrors.length > 0">
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

const emit = defineEmits(['update:modelValue']);

const parsedMappings = ref<LanguageMappings>([]);
const validationErrors = ref<string[]>([]);

watch(() => props.modelValue, (value) => {
  try {
    // Handle both string (from code) and array (from Directus JSON field)
    if (Array.isArray(value)) {
      parsedMappings.value = value;
    } else {
      parsedMappings.value = JSON.parse(value || '[]');
    }
  } catch (e) {
    parsedMappings.value = [];
  }
}, { immediate: true });

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
