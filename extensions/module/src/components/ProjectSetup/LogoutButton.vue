<template>
  <div>
    <v-button class="panel-button" kind="warning" warning :loading="loginButtonData.isLoading" @click="onLogout"
      >Logout from Localazy
    </v-button>

    <v-notice v-if="loginButtonData.error" type="danger" class="error">
      <div class="message">There was an error while logging out from Localazy. Please try again.</div>
    </v-notice>
  </div>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useStores } from '@directus/extensions-sdk';
import { useLocalazyStore } from '../../stores/localazy-store';
import { useLocalazyConfigStore } from '../../stores/localazy-config-store';
import { AnalyticsService } from '../../../../common/services/analytics-service';
import { LocalazyData } from '../../../../common/models/collections-data/localazy-data';

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

const onLogout = async () => {
  try {
    loginButtonData.value.isLoading = true;
    const orgId = localazyData.value.org_id;
    const name = localazyData.value.user_name;
    const userId = localazyData.value.user_id;

    const newData: LocalazyData = {
      access_token: '',
      org_id: '',
      project_id: '',
      project_name: '',
      project_url: '',
      user_id: '',
      user_name: '',
    };
    await configStore.save(newData);
    await hydrateLocalazyData({ force: true, localazyData });
    if (orgId && userId && name) {
      // Analytics is fire-and-forget; logout shouldn't block on telemetry.
      void AnalyticsService.trackLogOut({
        userId,
        orgId,
        name,
      });
    }
    notificationsStore.add({
      title: 'You are now logged out from Localazy',
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
