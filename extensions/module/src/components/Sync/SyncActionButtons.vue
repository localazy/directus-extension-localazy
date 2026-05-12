<template>
  <div>
    <div class="sync-action-buttons">
      <v-button :disabled="disableSyncButtons" secondary @click="$emit('upload')"> Export to Localazy </v-button>
      <div class="import-group">
        <v-button :disabled="disableSyncButtons" secondary @click="$emit('download')"> Import to Directus </v-button>
        <v-menu show-arrow placement="bottom-end">
          <template #activator="{ toggle }">
            <v-button :disabled="disableSyncButtons" secondary class="import-options" @click="toggle">
              <v-icon name="expand_more" />
            </v-button>
          </template>
          <v-list>
            <v-list-item clickable @click="$emit('download-full')">
              <v-list-item-icon><v-icon name="refresh" /></v-list-item-icon>
              <v-list-item-content>Full Sync (rebuild from scratch)</v-list-item-content>
            </v-list-item>
          </v-list>
        </v-menu>
      </div>
      <v-button :disabled="!hasChanges" secondary @click="$emit('save-settings')"> Save </v-button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { storeToRefs } from 'pinia';
import { computed } from 'vue';
import { useLocalazyStore } from '../../stores/localazy-store';

// `download` runs an incremental sync (default). `download-full` triggers a Full Sync,
// which rebuilds from scratch by running the same flow with an empty in-memory cursor.
defineEmits(['download', 'download-full', 'upload', 'save-settings']);

const props = defineProps({
  hasChanges: {
    type: Boolean,
    required: true,
  },
  disableSync: {
    type: Boolean,
    required: true,
  },
});

const { localazyProject, shouldDisableSyncOperations } = storeToRefs(useLocalazyStore());
const isNotConnectedToLocalazy = computed(() => localazyProject.value === null);

const disableSyncButtons = computed(() => props.disableSync || isNotConnectedToLocalazy.value || shouldDisableSyncOperations.value);
</script>

<style lang="scss" scoped>
.sync-action-buttons {
  display: flex;
  justify-content: space-between;
  gap: 4px;
}

.import-group {
  display: flex;
  gap: 2px;
}

.import-options {
  --v-button-min-width: 28px;
  --v-button-padding: 0 8px;
}
</style>
