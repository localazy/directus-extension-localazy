<template>
  <div>
    <div class="sync-action-buttons">
      <v-button :disabled="disableSyncButtons" secondary @click="$emit('upload')"> Export to Localazy </v-button>
      <v-button :disabled="disableSyncButtons" secondary @click="$emit('download')"> Import to Directus </v-button>
      <v-button :disabled="!hasChanges" secondary @click="$emit('save-settings')"> Save </v-button>
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
