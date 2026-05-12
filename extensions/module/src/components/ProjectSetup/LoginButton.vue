<template>
  <div>
    <v-button class="panel-button" :loading="loginButtonData.isLoading" @click="onLoginClick">Login to Localazy </v-button>

    <v-notice v-if="loginButtonData.error" type="danger" class="error">
      <div class="message">There was an error while trying to connect to Localazy. Please try again.</div>
    </v-notice>
  </div>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import { storeToRefs } from 'pinia';
import { GenericConnectorClient, Services, getOAuthAuthorizationUrl } from '@localazy/generic-connector-client';
import { useStores } from '@directus/extensions-sdk';
import { getConfig } from '../../../../common/config/get-config';
import { useLocalazyStore } from '../../stores/localazy-store';
import { useLocalazyConfigStore } from '../../stores/localazy-config-store';
import { AnalyticsService } from '../../../../common/services/analytics-service';
import { LocalazyData } from '../../../../common/models/collections-data/localazy-data';

const client = new GenericConnectorClient({
  pluginId: Services.DIRECTUS,
  genericConnectorUrl: getConfig().LOCALAZY_PLUGIN_CONNECTOR_API_URL,
});

const loginButtonData = ref({
  isLoading: false,
  error: false,
});

const configStore = useLocalazyConfigStore();
const { data: localazyData } = storeToRefs(configStore);
const localazyStore = useLocalazyStore();
const { hydrateLocalazyData } = localazyStore;
const { useNotificationsStore } = useStores();
const notificationsStore = useNotificationsStore();

const onLoginClick = async () => {
  try {
    loginButtonData.value.isLoading = true;

    const keys = await client.public.keys();
    const url = getOAuthAuthorizationUrl(
      {
        clientId: getConfig().LOCALAZY_OAUTH_APP_CLIENT_ID,
        customId: keys.writeKey,
        allowCreate: true,
        minimalRole: 'owner',
      },
      getConfig().LOCALAZY_OAUTH_URL,
    );
    window.open(url);

    // init continuous poll
    const pollResult = await client.oauth.continuousPoll({
      readKey: keys.readKey,
    });
    const pollResultData = pollResult.data;

    const newData: LocalazyData = {
      access_token: pollResultData.accessToken,
      org_id: pollResultData.project?.orgId || '',
      project_id: pollResultData.project?.id || '',
      project_name: pollResultData.project?.name || '',
      project_url: pollResultData.project?.url || '',
      user_id: pollResultData.user?.id || '',
      user_name: pollResultData.user?.name || '',
    };
    await configStore.save(newData);
    await hydrateLocalazyData({ force: true, localazyData });
    // Analytics is fire-and-forget; we don't want to block the login flow on telemetry.
    void AnalyticsService.trackLoggedIn({
      userId: pollResultData.user?.id || '',
      orgId: pollResultData.project?.orgId || '',
      name: pollResultData.user?.name || '',
    });
    notificationsStore.add({
      title: 'You are now logged in to Localazy',
    });
  } catch (_e) {
    loginButtonData.value.error = true;
  } finally {
    loginButtonData.value.isLoading = false;
  }
};
</script>

<style lang="scss" scoped>
.error {
  margin-top: 16px;
}
</style>
