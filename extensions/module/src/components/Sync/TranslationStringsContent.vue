<template>
  <div>
    <v-checkbox
      class="collection-item collection-item-clickable"
      :model-value="!!shouldSynchronize"
      @update:model-value="onToggle"
    >
      <span>
        <v-icon
          color="var(--primary)"
          class="collection-icon"
          name="translate"
        />
        <span class="collection-name">Translation Strings
          <a
            href="https://docs.directus.io/user-guide/content-module/translation-strings.html"
            target="_blank"
            class="open-in-new"
            title="Directus Translation Strings documentation"
            rel="noopener noreferrer">
            <v-icon name="open_in_new" small clickable />
          </a>
        </span>
      </span>
    </v-checkbox>
  </div>
</template>

<script lang="ts" setup>
import { PropType } from 'vue';

const props = defineProps({
  shouldSynchronize: {
    type: Number as PropType<0 | 1>,
    required: true,
  },
});

const emits = defineEmits(['update:shouldSynchronize']);

function onToggle() {
  emits('update:shouldSynchronize', props.shouldSynchronize ? 0 : 1);
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

.open-in-new {
  margin-left: 1px;
}

</style>
