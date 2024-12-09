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
import { ref, PropType } from 'vue';
import { useStores } from '@directus/extensions-sdk';
import { AppCollection } from '@directus/types';
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

const onLogout = async () => {
  try {
    loginButtonData.value.isLoading = true;
    const orgId = props.localazyData?.org_id || '';
    const name = props.localazyData?.user_name || '';
    const userId = props.localazyData?.user_id || '';

    if (props.localazyDataCollection) {
      const newData: LocalazyData = {
        access_token: '',
        org_id: '',
        project_id: '',
        project_name: '',
        project_url: '',
        user_id: '',
        user_name: '',
      };
      await upsertDirectusItem(
        props.localazyDataCollection.collection,
        props.localazyData,
        newData,
      );
      emit('update:localazyData', newData);
      await hydrateLocalazyData({ force: true, localazyData: newData });
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
