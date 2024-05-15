<template>
  <div>
    <v-button
      class="panel-button"
      @click="onLogout"
      kind="warning"
      warning
      :loading="loginButtonData.isLoading">Logout from Localazy
    </v-button>

    <v-notice type="danger" class="error" v-if="loginButtonData.error">
      <div class="message">
        There was an error while logging out from Localazy. Please try again.
      </div>
    </v-notice>
  </div>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useStores } from '@directus/extensions-sdk';
import { useDirectusApi } from '../../composables/use-directus-api';
import { useLocalazyStore } from '../../stores/localazy-store';
import { AnalyticsService } from '../../../../common/services/analytics-service';

const loginButtonData = ref({
  isLoading: false,
  error: false,
});

const { upsertDirectusItem } = useDirectusApi();
const localazyStore = useLocalazyStore();
const {
  hydrate,
} = localazyStore;
const { localazyDataCollection, localazyData } = storeToRefs(localazyStore);
const { useNotificationsStore } = useStores();
const notificationsStore = useNotificationsStore();

const onLogout = async () => {
  try {
    loginButtonData.value.isLoading = true;
    const orgId = localazyData.value?.orgId || '';
    const name = localazyData.value?.name || '';
    const userId = localazyData.value?.userId || '';

    if (localazyDataCollection.value) {
      await upsertDirectusItem(
        localazyDataCollection.value.collection,
        localazyData.value,
        {
          access_token: '',
          org_id: '',
          project_id: '',
          project_name: '',
          project_url: '',
          user_id: '',
          user_name: '',
        },
      );
      await hydrate({ force: true });
      if (orgId && userId && name) {
        AnalyticsService.trackLogOut({
          userId,
          orgId,
          name,
        });
      }
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
