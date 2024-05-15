<template>
  <div>
    <div class="sync-action-buttons">
      <v-button @click="$emit('upload')" :disabled="disableSyncButtons" secondary>
        Export to Localazy
      </v-button>
      <v-button @click="$emit('download')" :disabled="disableSyncButtons" secondary>
        Import to Directus
      </v-button>
      <v-button @click="$emit('save-settings')" :disabled="!hasChanges" secondary>
        Save
      </v-button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { storeToRefs } from 'pinia';
import { computed } from 'vue';
import { useLocalazyStore } from '../../stores/localazy-store';

defineEmits(['download', 'upload', 'save-settings']);

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
</style>
