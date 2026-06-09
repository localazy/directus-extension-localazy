<template>
  <span>
    <template v-for="(segment, index) in segments" :key="index">
      <mark v-if="segment.matched" class="match">{{ segment.text }}</mark>
      <template v-else>{{ segment.text }}</template>
    </template>
  </span>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { splitHighlight, HighlightSegment } from '../../composables/use-tree-search';

const props = defineProps({
  label: { type: String, required: true },
  normalizedQuery: { type: String, required: true },
});

const segments = computed<HighlightSegment[]>(() => splitHighlight(props.label, props.normalizedQuery));
</script>

<style lang="scss" scoped>
.match {
  background-color: var(--theme--primary-25, rgba(23, 198, 83, 0.2));
  color: inherit;
  border-radius: 3px;
  padding: 0 1px;
}
</style>
