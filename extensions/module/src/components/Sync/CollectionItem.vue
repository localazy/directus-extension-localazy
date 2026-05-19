<template>
  <v-list-group
    v-if="shouldRender"
    :open="isExpanded"
    :clickable="isExpandable"
    :arrow-placement="false"
    class="collection-group"
    @click="onGroupClick"
  >
    <template #activator>
      <v-list-item-icon v-if="isExpandable" class="collection-group-chevron" :class="{ active: isExpanded }">
        <v-icon name="chevron_right" />
      </v-list-item-icon>

      <v-checkbox
        v-if="isTranslatableCollection"
        class="collection-item collection-item-clickable"
        :value="collection.collection"
        :indeterminate="someTranslatableFieldsChecked && !allTranslatableFieldsChecked"
        :model-value="visibleCollectionSelectionValue"
        @update:model-value="onUpdateCollectionSelection"
      >
        <span>
          <v-icon :color="collection.color || 'var(--theme--primary)'" class="collection-icon" :name="collection.icon" />
          <highlighted-label class="collection-name" :label="collection.name" :normalized-query="normalizedQuery" />
        </span>
      </v-checkbox>

      <v-list-item v-else class="collection-item collection-item-unclickable v-list-item">
        <span>
          <v-icon :color="collection.color || 'var(--theme--primary)'" class="collection-icon" :name="collection.icon" />
          <highlighted-label class="collection-name" :label="collection.name" :normalized-query="normalizedQuery" />
        </span>
      </v-list-item>
    </template>

    <v-checkbox
      v-for="field in renderedFields"
      :key="`${collection.collection}-${field.field}`"
      class="field-item"
      :disabled="!isTranslatableField(field)"
      :value="`${collection.collection}-${field.field}`"
      :model-value="localSelections"
      :title="!isTranslatableField(field) ? `${field.type} is not translatable` : ''"
      @update:model-value="localSelections = $event"
    >
      <highlighted-label :label="field.name" :normalized-query="normalizedQuery" />
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
        :show-untranslatable-collections="showUntranslatableCollections"
        :normalized-query="normalizedQuery"
        :in-matched-subtree="childInMatchedSubtree"
        @update:selections="$emit('update:selections', $event)"
      />
    </div>
  </v-list-group>
</template>

<script lang="ts" setup>
import { PropType, computed, ref, watch } from 'vue';
import { AppCollection, Field } from '@directus/types';
import { isEqualWith } from 'lodash';
import { useGetFieldsForTranslationRelation } from '../../composables/use-get-fields-for-translation-relation';
import { EnabledField } from '../../../../common/models/collections-data/content-transfer-setup';
import { FieldsUtilsService } from '../../../../common/utilities/fields-utils-service';
import {
  descendantsInMatchedSubtree,
  getNestedCollections as visibilityGetNested,
  isCollectionShown,
  renderedFieldsFor,
  visibleFieldsForCollection,
  visibleTranslatableFieldsFor,
  VisibilityContext,
} from '../../composables/tree-visibility';
import HighlightedLabel from './HighlightedLabel.vue';

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
  normalizedQuery: {
    type: String,
    required: true,
  },
  // Set by the parent CollectionItem when this node is being rendered as a
  // descendant of a name-matched ancestor (Q3 / ADR-0003). When `true`, the
  // lens is effectively off for this node — every nested collection and field
  // is shown unfiltered, so a search like "deals" reveals the whole subtree.
  inMatchedSubtree: {
    type: Boolean,
    default: false,
  },
});

const emits = defineEmits(['update:selections']);

const isTranslatableField = FieldsUtilsService.isTranslatableField;

// Shared visibility context — the same shape Sync.vue feeds to the page-level
// scope-additive helpers, so the lens semantics stay in lockstep on both sides.
const { getTranslatableFields } = useGetFieldsForTranslationRelation();
const visibilityContext = computed<VisibilityContext>(() => ({
  isActive: props.normalizedQuery.length > 0,
  isMatch: (label: string) => (props.normalizedQuery.length === 0 ? true : label.toLowerCase().includes(props.normalizedQuery)),
  allCollections: props.collections,
  getFieldsForCollection: getTranslatableFields,
  showUntranslatableField: props.showUntranslatableField,
  showUntranslatableCollections: props.showUntranslatableCollections,
  isTranslatableCollection: (c) => props.translatableCollections.some((tc) => tc.collection === c.collection),
}));

const isTranslatableCollection = computed(() => visibilityContext.value.isTranslatableCollection(props.collection));

const lensActive = computed(() => visibilityContext.value.isActive);

// Full v-checkbox value set across collection + its (visible) translatable
// fields, mirroring the original behaviour but pruned to the lens-visible set
// while a search is active.
const localSelections = computed({
  get(): string[] {
    return props.selections
      .map((selection) => [selection.collection, ...selection.fields.map((field) => `${selection.collection}-${field}`)])
      .flat();
  },
  set(selections: string[]): void {
    const collectionFieldsMap = selections.reduce((acc, selection) => {
      const [collection, field] = selection.split('-');
      if (collection && field) {
        if (!acc.has(collection)) acc.set(collection, []);
        acc.get(collection)?.push(field);
      }
      return acc;
    }, new Map<string, string[]>());
    const updatedSelections = Object.entries(Object.fromEntries(collectionFieldsMap)).map(([collection, fields]) => ({
      collection,
      fields,
    }));

    emits('update:selections', updatedSelections);
  },
});

const selectionsForCollection = computed(() => props.selections.find((selection) => selection.collection === props.collection.collection));
const otherSelections = computed(() => props.selections.filter((selection) => selection.collection !== props.collection.collection));

// `inMatchedSubtree` propagates to this collection's children if either (a)
// this node is itself a descendant of a matched ancestor, or (b) this node's
// own name matches the active lens. Children render unfiltered in either case.
const childInMatchedSubtree = computed(() =>
  descendantsInMatchedSubtree(props.collection, visibilityContext.value, props.inMatchedSubtree),
);

const nestedCollections = computed(() =>
  visibilityGetNested(props.collection, visibilityContext.value).filter((c) =>
    isCollectionShown(c, visibilityContext.value, childInMatchedSubtree.value),
  ),
);

// Fields actually rendered under the lens: an ancestor's name match (or this
// collection's own) shows all rendered fields; otherwise only fields whose
// own names match.
const allRenderedFields = computed<Field[]>(() => renderedFieldsFor(props.collection, visibilityContext.value));
const renderedFields = computed<Field[]>(() =>
  visibleFieldsForCollection(props.collection, visibilityContext.value, props.inMatchedSubtree),
);

// `shouldRender` collapses three predicates: legacy visibility rules from
// CollectionItem.vue plus the lens. Delegated to `isCollectionShown` so the
// page-level scope-additive selection sees the same answer.
const shouldRender = computed(() => isCollectionShown(props.collection, visibilityContext.value, props.inMatchedSubtree));
const isExpandable = computed(() => nestedCollections.value.length > 0 || renderedFields.value.length > 0);

// Visible translatable fields — the scope the per-collection checkbox operates
// on under an active lens; falls back to the full rendered list otherwise so
// the legacy "translatable only" rule still drives unfiltered selection.
// Inside a name-matched subtree the lens is effectively off, so the scope
// becomes the full translatable set (same as unfiltered behaviour).
const visibleTranslatableFields = computed<Field[]>(() =>
  visibleTranslatableFieldsFor(props.collection, visibilityContext.value, props.inMatchedSubtree),
);
const translatableFieldsForToggle = computed<Field[]>(() =>
  lensActive.value && !props.inMatchedSubtree ? visibleTranslatableFields.value : allRenderedFields.value.filter(isTranslatableField),
);

const enabledFieldNames = computed<string[]>(() => selectionsForCollection.value?.fields ?? []);

const someTranslatableFieldsChecked = computed(() => {
  const scope = translatableFieldsForToggle.value;
  return enabledFieldNames.value.some((field) => scope.some((f) => f.field === field));
});

// The collection-level checkbox is "all checked" when every field in its
// scope (visible-only under a lens) is enabled.
const allTranslatableFieldsChecked = computed(() => {
  const scope = translatableFieldsForToggle.value;
  if (scope.length === 0) return false;
  const enabled = enabledFieldNames.value;
  return isEqualWith(
    scope,
    enabled,
    (scopeFields: Field[], selectionFields: string[]) =>
      scopeFields.length <= selectionFields.length && scopeFields.every((f) => selectionFields.includes(f.field)),
  );
});

// `v-checkbox`'s `:model-value` expects an array. Under a lens, surface the
// collection slug only when every *visible* translatable field is on.
const visibleCollectionSelectionValue = computed<string[]>(() => (allTranslatableFieldsChecked.value ? [props.collection.collection] : []));

function onUpdateCollectionSelection() {
  const scope = translatableFieldsForToggle.value;
  const scopeNames = scope.map((f) => f.field);
  const existing = enabledFieldNames.value;
  const allScopeOn = allTranslatableFieldsChecked.value;

  // Scope-additive (ADR-0003): only touch fields inside the current scope so
  // hidden-but-enabled fields survive a click while the lens is active.
  const remaining = existing.filter((f) => !scopeNames.includes(f));
  const next = allScopeOn ? remaining : [...remaining, ...scopeNames];

  if (next.length === 0) {
    emits('update:selections', otherSelections.value);
    return;
  }
  emits('update:selections', [
    ...otherSelections.value,
    {
      collection: props.collection.collection,
      fields: next,
    },
  ]);
}

// Expansion state: the lens drives it while active (Q12 / ADR-0003). When the
// lens flips off, restore the user's pre-lens expansion. `preLensExpanded`
// remembers what `isExpanded` was the moment the lens turned on. Any node
// that survives `shouldRender` under an active lens is auto-expanded — both
// "I matched" nodes and "I'm inside a matched subtree" nodes need their body
// visible for the user to actually act on the result.
const userExpanded = ref(allRenderedFields.value.length === 0);
const preLensExpanded = ref<boolean | null>(null);
const isExpanded = computed(() => (lensActive.value ? true : userExpanded.value));

watch(lensActive, (active, wasActive) => {
  if (active && !wasActive) {
    preLensExpanded.value = userExpanded.value;
  } else if (!active && wasActive && preLensExpanded.value !== null) {
    userExpanded.value = preLensExpanded.value;
    preLensExpanded.value = null;
  }
});

function onGroupClick() {
  // Clicks during an active lens are absorbed — the lens owns expansion (Q12a).
  if (lensActive.value) return;
  userExpanded.value = !userExpanded.value;
}

// When the collection becomes auto-collapsed by gaining children (e.g. a field
// appears via a toggle change), keep the legacy "no fields => start expanded"
// rule for the non-lens case.
watch(allRenderedFields, (next) => {
  if (lensActive.value) return;
  if (next.length === 0) userExpanded.value = true;
});
</script>

<style lang="scss" scoped>
.collection-icon {
  margin-right: 8px;
}

.collection-item-clickable {
  font-weight: 500;
  margin-top: 8px !important;
  margin-bottom: 8px !important;
}

.collection-item-unclickable {
  font-weight: 400;
  margin-bottom: 0px !important;
}

.field-item {
  margin-left: 28px;
  margin-bottom: 8px !important;
}

.collection-group {
  display: block;
}

.collection-group-chevron {
  margin-right: 0 !important;
  color: var(--theme--foreground-subdued);
  transform: rotate(0deg);
  transition: transform var(--medium) var(--transition);

  &:hover {
    color: var(--theme--foreground);
  }

  &.active {
    transform: rotate(90deg);
  }
}
</style>
