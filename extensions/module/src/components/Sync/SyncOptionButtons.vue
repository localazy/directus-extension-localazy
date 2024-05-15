<template>
  <div class="sync-option-buttons">
    <v-checkbox
      class="checkbox-button"
      :indeterminate="someTranslatableFieldsChecked && !allTranslatableFieldsChecked"
      :model-value="allTranslatableFieldsChecked"
      @update:model-value="onUpdateCollectionSelection"
    >
      <span class="button-label" v-if="allTranslatableFieldsChecked">Deselect all</span>
      <span class="button-label" v-else>Select all</span>
    </v-checkbox>

    <v-menu show-arrow>
      <template #activator="{ toggle }">
        <div
          @click="toggle"
          class="button">
          <v-icon name="visibility" />
          <span class="button-label">Options</span>
        </div>
      </template>

      <v-list>
        <v-list-item>
          <v-checkbox v-model="localShowUntranslatableField">
            Show untranslatable fields
          </v-checkbox>
        </v-list-item>
      </v-list>

      <v-list>
        <v-list-item>
          <v-checkbox v-model="localShowUntranslatableCollections">
            Show collections without translatable fields
          </v-checkbox>
        </v-list-item>
      </v-list>
    </v-menu>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';

const props = defineProps({
  showUntranslatableField: {
    type: Boolean,
    required: true,
  },
  showUntranslatableCollections: {
    type: Boolean,
    required: true,
  },
  allTranslatableFieldsChecked: {
    type: Boolean,
    required: true,
  },
  someTranslatableFieldsChecked: {
    type: Boolean,
    required: true,
  },
});

const emits = defineEmits(['select-all', 'deselect-all', 'update:showUntranslatableField', 'update:showUntranslatableCollections']);

const localShowUntranslatableField = computed({
  get: () => props.showUntranslatableField,
  set: (value: boolean) => emits('update:showUntranslatableField', value),
});

const localShowUntranslatableCollections = computed({
  get: () => props.showUntranslatableCollections,
  set: (value: boolean) => emits('update:showUntranslatableCollections', value),
});

function onUpdateCollectionSelection() {
  if (props.allTranslatableFieldsChecked) {
    emits('deselect-all');
  } else {
    emits('select-all');
  }
}
</script>

<style lang="scss" scoped>
.sync-option-buttons {
  display: flex;
  justify-content: space-between;
  padding: 16px 4px;
  border-top: 2px solid #F0F4F9;
  border-bottom: 2px solid #F0F4F9;
  width: 100%;

  & .v-icon {
    --v-icon-color: var(--foreground-subdued);
  }

  .checkbox-button {
    &::v-deep(.v-icon) {
        color: var(--foreground-subdued);
      }

    &:hover {
      ::v-deep(.checkbox) {
        color: var(--foreground-subdued);
      }
    }
  }

  & .button-label {
    color: var(--foreground-subdued);
    font-weight: 500;
  }

  & .button {
    display: flex;
    gap: 4px;
    cursor: pointer;
  }
}
</style>
