<template>
  <v-list nav>
    <v-list-item to="/localazy/overview">
      <v-list-item-icon><v-icon name="home" /></v-list-item-icon>
      <v-list-item-content>
        <v-text-overflow text="Overview" />
      </v-list-item-content>
    </v-list-item>
    <v-list-item to="/localazy/actions">
      <v-list-item-icon><v-icon name="translate" /></v-list-item-icon>
      <v-list-item-content>
        <v-text-overflow text="Import & Export" />
      </v-list-item-content>
    </v-list-item>
    <v-list-item to="/localazy/project-setup">
      <v-list-item-icon><v-icon name="lan" /></v-list-item-icon>
      <v-list-item-content>
        <v-text-overflow text="Project Setup" />
      </v-list-item-content>
    </v-list-item>
    <v-list-item to="/localazy/additional-settings">
      <v-list-item-icon><v-icon name="settings" /></v-list-item-icon>
      <v-list-item-content>
        <v-text-overflow text="Additional Settings" />
      </v-list-item-content>
    </v-list-item>
    <v-list-item to="/localazy/about">
      <v-list-item-icon><v-icon name="school" /></v-list-item-icon>
      <v-list-item-content>
        <v-text-overflow text="About" />
      </v-list-item-content>
    </v-list-item>
    <v-list-item href="https://www.npmjs.com/package/@localazy/directus-extension-localazy" class="version">
      <v-list-item-icon><v-icon name="help_outline" /></v-list-item-icon>
      <v-list-item-content>
        <v-text-overflow :text="versionLabel" />
      </v-list-item-content>
    </v-list-item>
  </v-list>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import packageJson from '../../package.json';

const version = ref<string>(packageJson.version);
const versionLabel = ref<string>(`Version ${version.value}`);
</script>

<style lang="scss" scoped>

.version {
  color: var(--foreground-subdued);
  transition: color var(--fast) var(--transition);

  &::v-deep(.v-icon) {
    color: var(--foreground-subdued);
    transition: color var(--fast) var(--transition);
  }
}
</style>
