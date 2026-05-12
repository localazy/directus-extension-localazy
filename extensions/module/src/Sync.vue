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
        @upload="onExport"
        @download="onImport"
        @save-settings="onSaveSettings({ notify: true })"
      />
    </template>

    <div class="panel">
      <config-notice class="notice" :has-incomplete-configuration="hasIncompleteConfiguration" />
      <errors-notice class="notice" :localazy-data="localazyData" />

      <sync-option-buttons
        v-model:show-untranslatable-field="showUntranslatableField"
        v-model:show-untranslatable-collections="showUntranslatableCollections"
        :all-translatable-fields-checked="allTranslatableFieldsChecked"
        :some-translatable-fields-checked="someTranslatableFieldsChecked"
        @select-all="selectAll"
        @deselect-all="deselectAll"
      />

      <div v-if="installed" class="page">
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
            @update:selections="enabledFields = $event"
          />
        </div>

        <translation-strings-content
          v-model:should-synchronize="synchronizeTranslationStrings"
          :class="{
            'translation-strings-separator': iteratedCollections.length > 0,
          }"
        />
      </div>

      <progress-tracker-modal
        :show-progress="showProgress"
        :loading="loading"
        :progress-tracker="progressTracker"
        @finish="onFinishAction"
      />
    </div>
  </private-view>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
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
import { useInitSyncContainer } from './composables/use-sync-container-init';
import { useSyncContainerActions } from './composables/use-sync-container-actions';
import { useLocalazyInstallerStore } from './stores/localazy-installer-store';
import { useLocalazyConfigStore } from './stores/localazy-config-store';
import { useLocalazyStore } from './stores/localazy-store';
import { useLocalazyConfigurationStatus } from './composables/use-localazy-configuration-status';

const { translatableRootCollections, rootCollections, translatableCollections, collections } = useCollectionsOrganizer();
const { getTranslatableFields } = useGetFieldsForTranslationRelation();
const { progressTracker } = storeToRefs(useProgressTrackerStore());

const showUntranslatableField = ref(false);
const showUntranslatableCollections = ref(false);
const { enabledFields, synchronizeTranslationStrings } = useInitSyncContainer();
const { onSaveSettings, onExport, onImport, onFinishAction, showProgress, loading, hasChanges } = useSyncContainerActions({
  enabledFields,
  synchronizeTranslationStrings,
});

const installer = useLocalazyInstallerStore();
const { installed } = storeToRefs(installer);
const { data: localazyData } = storeToRefs(useLocalazyConfigStore());
const { hasIncompleteConfiguration } = useLocalazyConfigurationStatus();
const localazyStore = useLocalazyStore();
// Bootstrap Localazy API state once the installer (and therefore the config row) is ready.
void installer.run().then(() => localazyStore.hydrateLocalazyData({ localazyData }));

const iteratedCollections = computed(() =>
  showUntranslatableCollections.value ? rootCollections.value : translatableRootCollections.value,
);

const allTranslatableFields = computed(() =>
  translatableCollections.value
    .map((c) => [
      {
        collection: c.collection,
        fields: getTranslatableFields(c.collection).translatableFields.map((f) => f.field),
      },
    ])
    .flat(),
);

const someTranslatableFieldsChecked = computed(() => enabledFields.value.length > 0);
const allTranslatableFieldsChecked = computed(() => enabledFields.value.length === allTranslatableFields.value.length);

function selectAll() {
  enabledFields.value = allTranslatableFields.value;
  synchronizeTranslationStrings.value = true;
}

function deselectAll() {
  enabledFields.value = [];
  synchronizeTranslationStrings.value = false;
}
</script>

<style lang="scss" scoped>
@import './styles/mixins/page';
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
  border-top: 1px solid var(--border-normal);
}
</style>
