<template>
  <v-list-group
    v-if="shouldRender"
    :open="isExpanded"
    :clickable="isExpandable"
    @click="onGroupClick"
    :arrowPlacement="false"
    class="collection-group"
  >

    <template #activator>
      <v-list-item-icon
        v-if="isExpandable"
        class="collection-group-chevron"
        :class="{ active: isExpanded }"
      >
        <v-icon name="chevron_right" />
      </v-list-item-icon>

      <v-checkbox
        v-if="isTranslatableCollection"
        class="collection-item collection-item-clickable"
        :value="collection.collection"
        :indeterminate="someTranslatableFieldsChecked && !allTranslatableFieldsChecked"
        :model-value="selections.map((selection) => selection.collection)"
        @update:model-value="onUpdateCollectionSelection"
      >
        <span>
          <v-icon
            :color="collection.color || 'var(--primary)'"
            class="collection-icon"
            :name="collection.icon"
          />
          <span class="collection-name">{{ collection.name }}</span>
        </span>
      </v-checkbox>

      <v-list-item
        v-else
        class="collection-item collection-item-unclickable v-list-item"
      >
        <span>
          <v-icon
            :color="collection.color || 'var(--primary)'"
            class="collection-icon"
            :name="collection.icon"
          />
          <span class="collection-name">{{ collection.name }}</span>
        </span>
      </v-list-item>
    </template>

    <v-checkbox
      v-for="field in renderedFields"
      :key="`${collection.collection}-${field.field}`"
      class="field-item"
      :disabled="!isTranlatableField(field)"
      :value="`${collection.collection}-${field.field}`"
      :model-value="localSelections"
      :title="!isTranlatableField(field) ? `${field.type} is not translatable` : ''"
      @update:model-value="localSelections = $event">
      <span>{{ field.name }}</span>
    </v-checkbox>

    <div class="collection-group">
      <collection-item
        v-for="col in nestedCollections"
        :key="col.collection"
        :collection="col"
        :collections="collections"
        :translatable-collections="translatableCollections"
        :selections="selections"
        :show-untranslatable-field="showUntranslatableField"
        :showUntranslatableCollections="showUntranslatableCollections"
        @update:selections="$emit('update:selections', $event)"
      />
    </div>
  </v-list-group>
</template>

<script lang="ts" setup>
import { PropType, computed, ref } from 'vue';
import { AppCollection, Field } from '@directus/types';
import { isEqualWith } from 'lodash';
import { useGetFieldsForTranslationRelation } from '../../composables/use-get-fields-for-translation-relation';
import { EnabledField } from '../../../../common/models/collections-data/content-transfer-setup';
import { FieldsUtilsService } from '../../../../common/utilities/fields-utils-service';

const props = defineProps({
  collection: {
    type: Object as PropType<AppCollection>,
    required: true,
  },
  collections: {
    type: Array as PropType<AppCollection[]>,
    required: true,
  },
  translatableCollections: {
    type: Array as PropType<AppCollection[]>,
    required: true,
  },
  selections: {
    type: Array as PropType<EnabledField[]>,
    required: true,
  },
  showUntranslatableField: {
    type: Boolean,
    required: true,
  },
  showUntranslatableCollections: {
    type: Boolean,
    required: true,
  },
});

const emits = defineEmits(['update:selections']);

const localSelections = computed({
  get() : string[] {
    return props.selections.map((selection) => [
      selection.collection,
      ...selection.fields.map((field) => `${selection.collection}-${field}`),
    ]).flat();
  },
  set(selections: string[]): void {
    const collectionFieldsMap = selections
      .reduce((acc, selection) => {
        const [collection, field] = selection.split('-');
        if (collection && field) {
          if (!acc.has(collection)) {
            acc.set(collection, []);
          }
          acc.get(collection)?.push(field);
        }
        return acc;
      }, new Map<string, string[]>());
    const updatedSelections = Object.entries(Object.fromEntries(collectionFieldsMap))
      .map(([collection, fields]) => ({ collection, fields }));

    emits('update:selections', updatedSelections);
  },

});

const selectionsForCollection = computed(() => props.selections
  .find((selection) => selection.collection === props.collection.collection));
const otherSelections = computed(() => props.selections
  .filter((selection) => selection.collection !== props.collection.collection));

const isTranslatableCollection = computed(() => props.translatableCollections
  .some((col) => col.collection === props.collection.collection));

const isTranlatableField = FieldsUtilsService.isTranslatableField;

const nestedCollections = computed(() => props.collections.filter((collection) => collection.meta?.group === props.collection.collection));
const collection = computed(() => props.collection);

const { translatableFields, allFields } = useGetFieldsForTranslationRelation().getTranslatableFields(collection.value.collection);
const renderedFields = computed(() => (props.showUntranslatableField ? allFields : translatableFields));
const isExpanded = ref(renderedFields.value.length === 0);

const shouldRender = computed(() => nestedCollections.value.length > 0
|| (isTranslatableCollection.value || props.showUntranslatableCollections));
const isExpandable = computed(() => nestedCollections.value.length > 0 || renderedFields.value.length > 0);

const someTranslatableFieldsChecked = computed(() => {
  const fields = translatableFields
    .filter(isTranlatableField);
  return (selectionsForCollection.value?.fields || [])
    .some((field) => fields.some((f) => f.field === field));
});

const allTranslatableFieldsChecked = computed(() => {
  const fields = translatableFields
    .filter(isTranlatableField);

  return fields.length > 0
    && isEqualWith(
      fields,
      selectionsForCollection.value?.fields || [],
      (translatedFields: Field[], selectionFields: string[]) => translatedFields.length === selectionFields.length
        && translatedFields.every((translatableField) => selectionFields.includes(translatableField.field)),
    );
});

function onUpdateCollectionSelection() {
  const fields = translatableFields
    .filter(isTranlatableField);
  if (allTranslatableFieldsChecked.value) {
    emits('update:selections', otherSelections.value);
  } else {
    emits('update:selections', [
      ...otherSelections.value,
      {
        collection: props.collection.collection,
        fields: fields.map((field) => field.field),
      },
    ]);
  }
}

function onGroupClick() {
  isExpanded.value = !isExpanded.value;
}
</script>

<style lang="scss" scoped>

.collection-icon {
  margin-right: 8px;
}

.collection-item-clickable {
  font-weight: 500;
  margin-top: 8px!important;
  margin-bottom: 8px!important;
}

.collection-item-unclickable {
  font-weight: 400;
  margin-bottom: 0px!important;
}

.field-item {
  margin-left: 28px;
  margin-bottom: 8px!important;
}

.collection-group {
  display: block;
}

.collection-group-chevron {
 margin-right: 0 !important;
 color: var(--foreground-subdued);
 transform: rotate(0deg);
 transition: transform var(--medium) var(--transition);

 &:hover {
  color: var(--foreground-normal);
 }

 &.active {
  transform: rotate(90deg);
 }
}

</style>
../../../common/utilities/fields-utils-service
