<template>
  <div>
    <v-checkbox v-model="shouldSynchronize" class="collection-item collection-item-clickable">
      <span>
        <v-icon color="var(--theme--primary)" class="collection-icon" name="translate" />
        <span class="collection-name"
          >Translation Strings
          <a
            href="https://docs.directus.io/user-guide/content-module/translation-strings.html"
            target="_blank"
            class="open-in-new"
            title="Directus Translation Strings documentation"
            rel="noopener noreferrer"
          >
            <v-icon name="open_in_new" small clickable />
          </a>
        </span>
      </span>
    </v-checkbox>
  </div>
</template>

<script lang="ts" setup>
// Previously this component had a hand-rolled v-model that re-emitted the OLD prop
// value, so the toggle silently no-op'd. defineModel binds correctly to v-checkbox.
const shouldSynchronize = defineModel<boolean>('shouldSynchronize', { required: true });
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

.open-in-new {
  margin-left: 1px;
}
</style>
