<template>
  <v-dialog :modelValue="showProgress">
    <v-card>
      <v-card-title>Progress Status</v-card-title>
      <v-card-text>
        <div v-for="(progress, idx) in progressTracker" :key="idx">
          <v-icon name="clear" color="var(--danger)" v-if="progress.type === 'error'" />
          <v-icon name="check" color="var(--success)" v-else-if="idx + 1 < progressTracker.length || !loading" />
          <v-icon name="arrow_right_alt" color="var(--foreground-subdued)" v-else />
          <span>
            {{ progress.message }}
          </span>
        </div>
      </v-card-text>

      <v-card-actions>
        <v-button :loading="loading" @click="$emit('finish')">
          Done
        </v-button>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { PropType } from 'vue';
import { ProgressTracker } from '../../models/progress-tracker';

defineProps({
  showProgress: {
    type: Boolean,
    required: true,
  },
  progressTracker: {
    type: Array as PropType<ProgressTracker>,
    required: true,
  },
  loading: {
    type: Boolean,
    required: true,
  },
});

defineEmits(['update:showProgress', 'finish']);
</script>

<style scoped lang="scss">
</style>
