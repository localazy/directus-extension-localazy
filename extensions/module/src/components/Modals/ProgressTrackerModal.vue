<template>
  <v-dialog :model-value="showProgress">
    <v-card>
      <v-card-title>Progress Status</v-card-title>
      <v-card-text>
        <div v-for="(progress, idx) in progressTracker" :key="idx">
          <v-icon v-if="progress.type === 'error'" name="clear" color="var(--danger)" />
          <v-icon v-else-if="idx + 1 < progressTracker.length || !loading" name="check" color="var(--success)" />
          <v-icon v-else name="arrow_right_alt" color="var(--foreground-subdued)" />
          <span>
            {{ progress.message }}
          </span>
        </div>
      </v-card-text>

      <v-card-actions>
        <v-button :loading="loading" @click="$emit('finish')"> Done </v-button>
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

<style scoped lang="scss"></style>
