<template>
  <private-view title="About this plugin" icon="school">
    <template #headline>
      <v-breadcrumb :items="[{ name: 'Localazy', to: '/localazy' }]" />
    </template>

    <template #navigation>
      <Navigation />
    </template>

    <div class="panel page">
      <h2>This is a content localization plugin by Localazy</h2>

      <p>
        The Directus localization plugin by Localazy allows you to synchronize your content with Localazy and translate it with available
        tools. You can manage your language versions separately in Localazy and import new content for translation as you add it seamlessly
        without manual copy-pasting or file importing.
      </p>

      <p>
        You can also automate the import step: once you install the companion automation bundle, Localazy notifies your Directus instance
        whenever new translations are ready, and the plugin imports them back without any manual action. Every synchronisation — whether
        manual or automated — is recorded on the Activity page so you can review what happened, when, and by whom.
      </p>

      <p>
        To learn more about this plugin, visit
        <a href="https://localazy.com/docs/directus/directus-plugin-introduction-installation" target="_blank">
          the Localazy documentation section</a
        >.
      </p>

      <h2>Plugin Pages</h2>
      <h3><v-icon name="home" /><span>Overview Screen</span></h3>
      <p>On the overview screen, users can find basic information about the Localazy connection with their Directus project.</p>
      <p>
        Learn more in
        <a href="https://localazy.com/docs/directus/directus-overview-screen" target="_blank">the documentation</a>.
      </p>

      <h3><v-icon name="translate" /><span>Import & Export</span></h3>
      <p>
        The Import & Export page allows you to synchronize the content between Directus and Localazy. From here, you may choose which
        translatable collections will be exported from Directus and imported back. You may also synchronize the Directus
        <a href="https://docs.directus.io/user-guide/content-module/translation-strings.html" target="_blank">translation strings</a>.
      </p>
      <p>
        Learn more in
        <a href="https://localazy.com/docs/directus/directus-import-export" target="_blank">the documentation</a>.
      </p>

      <h3><v-icon name="history" /><span>Activity</span></h3>
      <p>
        The Activity page lists every synchronisation session — uploads to Localazy, downloads back into Directus, and incoming webhook
        events from automated imports. Each session is grouped by type, can be filtered by initiator, status, date range, or free-text
        search, and opens into a detail view with per-step logs. You can export the currently visible sessions as JSON or clear the log
        entirely. The last 100 sessions are retained; older ones are pruned automatically.
      </p>

      <h3><v-icon name="cloud_sync" /><span>Automation</span></h3>
      <p>
        The Automation page configures hands-off, webhook-driven import. When the companion
        <code>@localazy/directus-extension-localazy-automation</code> bundle is installed, Localazy can call back into your Directus
        instance the moment translations are ready, and the plugin re-imports them on your behalf — no scheduled job, no manual click. The
        page guides you through generating a shared webhook secret, picking which events should trigger an import, and verifying the bundle
        is reachable. If the bundle is not installed, the page surfaces a link to the installation guide instead.
      </p>
      <p>
        Learn more in the
        <a href="https://github.com/localazy/directus-extension-localazy/blob/main/extensions/sync-hook/README.md" target="_blank"
          >automation bundle README</a
        >.
      </p>

      <h3><v-icon name="lan" /><span>Project Setup</span></h3>
      <p>
        The Project Setup page serves to configure the connection between Localazy and Directus. <br />
        To start using this plugin, login to your Localazy project.<br />
      </p>

      <p>
        Furthermore, you need to create a languages collection and create a translations field type in collections you wish to translate.
        Refer to Directus'
        <a href="https://docs.directus.io/guides/headless-cms/content-translations.html" target="_blank">official guide</a>
        on how to prepare for content translation.
      </p>

      <p>
        Once ready, you need to select which field from the languages collection represents the language code. If you follow the official
        guide, the <b>code</b> field will be automatically selected. <br />
      </p>

      <p>
        Lastly, choose the source language of your Directus content. This doesn't need to be the same language as in your Localazy project,
        although it is recommended. The source language is the main language in which all your content is written. This is the language from
        which the translations will be provided.
      </p>

      <p>
        Learn more in
        <a href="https://localazy.com/docs/directus/directus-project-setup" target="_blank">the documentation</a>.
      </p>

      <h3><v-icon name="settings" /><span>Additional Settings</span></h3>
      <p>
        The Additional Settings page allows you to customize the behavior of import & export operations and their side effects. The default
        configuration works well for most use cases, but you may want to change it to fit your needs.
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
@use './styles/mixins/page' as *;

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
  /* Directus 11 renamed theme tokens to the `--theme--*` namespace. The old
     `--border-subdued` is undefined → the whole shorthand becomes invalid CSS
     and the section divider disappears. */
  border-bottom: 2px solid var(--theme--border-color-subdued);
  font-weight: 600;
}

h3 {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  margin-top: 56px;
  margin-bottom: 14px;
  padding-bottom: 4px;
  font-size: 20px;
  line-height: 22px;
  border-bottom: 1px solid var(--theme--border-color-subdued);

  .v-icon {
    color: var(--theme--primary);
  }
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
