<template>
  <private-view>
    <template #title-outer:prepend>
      <v-button class="header-icon" rounded disabled icon secondary>
        <v-icon name="school" />
      </v-button>
    </template>

    <template #title>
      <h1 class="type-title">About this plugin</h1>
    </template>

    <template #headline>
      <v-breadcrumb :items="[{ name: 'Localazy', to: '/localazy' }]" />
    </template>

    <template #navigation>
      <Navigation />
    </template>

    <div class="panel page">
      <h2>This is a content localization plugin by Localazy</h2>

      <p>
        The Directus localization plugin by Localazy allows you to synchronize your content with Localazy
        and translate it with available tools.
        You can manage your language versions separately in Localazy and import new content for
        translation as you add it seamlessly without manual copy-pasting or file importing.
      </p>

      <p>
        To learn more about this plugin, visit
        <a href="https://localazy.com/docs/directus/directus-plugin-introduction-installation" target="_blank">
          the Localazy documentation section</a>.
      </p>

      <h2>Plugin Pages</h2>
      <h3>Overview Screen</h3>
      <p>
        On the overview screen, users can find basic information about the Localazy connection
        with their Directus project.
      </p>
      <p>
        Learn more in
        <a href="https://localazy.com/docs/directus/directus-overview-screen" target="_blank">the documentation</a>.
      </p>

      <h3>Import & Export</h3>
      <p>
        The Import & Export page allows you to synchronize the content between Directus and Localazy.
        From here, you may choose which translatable collections will be exported from Directus and imported back.
        You may also synchronize the Directus
        <a href="https://docs.directus.io/user-guide/content-module/translation-strings.html" target="_blank">translation strings</a>.
      </p>
      <p>
        Learn more in
        <a href="https://localazy.com/docs/directus/directus-import-export" target="_blank">the documentation</a>.
      </p>

      <h3>Project Setup</h3>
      <p>
        The Project Setup page serves to configure the connection between Localazy and Directus. <br>
        To start using this plugin, login to your Localazy project.<br>
      </p>

      <p>
        Furthermore, you need to create a languages collection and create a translations field type in collections you
        wish to translate. Refer to Directus'
        <a href="https://docs.directus.io/guides/headless-cms/content-translations.html" target="_blank">official guide</a>
        on how to prepare for content translation.
      </p>

      <p>
        Once ready, you need to select which field from the languages collection represents the language code.
        If you follow the official guide, the <b>code</b>
        field will be automatically selected. <br>
      </p>

      <p>
        Lastly, choose the source language of your Directus content. This doesn't need to be the same language as in your Localazy project,
        although it is recommended. The source language is the main language in which all your content is written.
        This is the language from which the translations will be provided.
      </p>

      <p>
        Learn more in
        <a href="https://localazy.com/docs/directus/directus-project-setup" target="_blank">the documentation</a>.
      </p>

      <h3>Additional Settings</h3>
      <p>
        The Additional Settings page allows you to customize the behavior of import & export operations and their side effects.
        The default configuration works well for most use cases, but you may want to change it to fit your needs.
      </p>
      <p>
        Learn more in
        <a href="https://localazy.com/docs/directus/directus-additional-settings" target="_blank">the documentation</a>.
      </p>
    </div>

  </private-view>
</template>

<script lang="ts" setup>
import Navigation from './components/Navigation.vue';

</script>

<style lang="scss" scoped>
@import './styles/mixins/page';

.page {
  @include page;
}

.panel {
  padding: var(--content-padding);
  padding-top: 0;
  padding-bottom: var(--content-padding-bottom);
}

h1 {
  font-weight: 600;
}

h2 {
  margin-top: 60px;
  margin-bottom: 20px;
  padding-bottom: 4px;
  font-size: 24px;
  line-height: 34px;
  border-bottom: 2px solid var(--border-subdued);
  font-weight: 600;
}

h3 {
  font-weight: 600;
  margin-top: 30px;
  margin-bottom: 10px;
  padding-bottom: 4px;
  font-size: 20px;
  line-height: 22px;
  border-bottom: 1px solid var(--border-subdued);
}

p {
  font-size: 16px;
  margin-block-start: 1em;
  margin-block-end: 1em;
  margin-inline-start: 0px;
  margin-inline-end: 0px;
}

a {
  text-decoration: underline;
}
</style>
