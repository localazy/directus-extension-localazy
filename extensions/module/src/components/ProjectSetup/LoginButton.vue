<template>
  <div>
    <v-button
      class="panel-button"
      @click="onLoginClick"
      :loading="loginButtonData.isLoading">Login to Localazy
    </v-button>

    <v-notice type="danger" class="error" v-if="loginButtonData.error">
      <div class="message">
        There was an error while trying to connect to Localazy. Please try again.
      </div>
    </v-notice>
  </div>
</template>

<script lang="ts" setup>
import { PropType, ref } from 'vue';
import { GenericConnectorClient, Services, getOAuthAuthorizationUrl } from '@localazy/generic-connector-client';
import { useStores } from '@directus/extensions-sdk';
import { AppCollection } from '@directus/types';
import { getConfig } from '../../../../common/config/get-config';
import { useDirectusApi } from '../../composables/use-directus-api';
import { useLocalazyStore } from '../../stores/localazy-store';
import { AnalyticsService } from '../../../../common/services/analytics-service';
import { LocalazyData } from '../../../../common/models/collections-data/localazy-data';

type Collection = AppCollection | null;

const props = defineProps({
  localazyData: {
    type: Object as PropType<LocalazyData | null>,
    required: true,
  },
  localazyDataCollection: {
    type: Object as PropType<Collection | null>,
    required: true,
  },
});

const client = new GenericConnectorClient({
  pluginId: Services.DIRECTUS,
  genericConnectorUrl: getConfig().LOCALAZY_PLUGIN_CONNECTOR_API_URL,
});

const loginButtonData = ref({
  isLoading: false,
  error: false,
});

const { upsertDirectusItem } = useDirectusApi();
const localazyStore = useLocalazyStore();
const {
  hydrateLocalazyData,
} = localazyStore;
const { useNotificationsStore } = useStores();
const notificationsStore = useNotificationsStore();
const emit = defineEmits(['update:localazyData']);

const onLoginClick = async () => {
  try {
    loginButtonData.value.isLoading = true;

    const keys = await client.public.keys();
    const url = getOAuthAuthorizationUrl({
      clientId: getConfig().LOCALAZY_OAUTH_APP_CLIENT_ID,
      customId: keys.writeKey,
      allowCreate: true,
      minimalRole: 'owner',
    }, getConfig().LOCALAZY_OAUTH_URL);
    window.open(url);

    // init continuous poll
    const pollResult = await client.oauth.continuousPoll({
      readKey: keys.readKey,
    });
    const pollResultData = pollResult.data;

    if (props.localazyDataCollection) {
      const newData: LocalazyData = {
        access_token: pollResultData.accessToken,
        org_id: pollResultData.project?.orgId || '',
        project_id: pollResultData.project?.id || '',
        project_name: pollResultData.project?.name || '',
        project_url: pollResultData.project?.url || '',
        user_id: pollResultData.user?.id || '',
        user_name: pollResultData.user?.name || '',
      };
      await upsertDirectusItem(
        props.localazyDataCollection.collection,
        props.localazyData,
        newData,
      );
      emit('update:localazyData', newData);
      await hydrateLocalazyData({ force: true, localazyData: props.localazyData });
      AnalyticsService.trackLoggedIn({
        userId: pollResultData.user?.id || '',
        orgId: pollResultData.project?.orgId || '',
        name: pollResultData.user?.name || '',
      });
      notificationsStore.add({
        title: 'You are now logged in to Localazy',
      });
    }
  } catch (e) {
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
