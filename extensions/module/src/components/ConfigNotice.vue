<template>
  <div>
    <v-notice type="info" v-if="isDemo">
      <div class="message">
        <div>
          <h2>This is a demo of the localization plugin by Localazy</h2>
          <div>Some settings options are limited. The demo is reset every 24 hours.</div>
        </div>
      </div>
    </v-notice>

    <v-notice type="info" v-if="hasIncompleteConfiguration">
      <div class="message">
        <div>
          <h2>Your configuration is incomplete.</h2>
          <div>Please fill in the project setup form in the
            <router-link to="/localazy/project-setup">Project setup page</router-link>.
          </div>
        </div>
      </div>
    </v-notice>

    <v-notice type="info" v-if="lacksAccessToPlugin">
      <div class="message">
        <div>
          <h2>You don't have access to Localazy plugin</h2>
          <div>Your current subscription doesn't include access to the Localazy plugin</div>

          <div>
            Please <a :href="marketPlaceUrl" target="_blank">upgrade your current subscription</a> to resolve it.
          </div>
        </div>
      </div>
    </v-notice>

    <v-notice type="info" v-else-if="exceededKeyLimit">
      <div class="message">
        <div>
          <h2>Exceed source keys limit in Localazy</h2>
          <div>You have exceeded the available amount of source keys and export and import options are currently disabled.
          </div>

          <div>
            Please <a :href="marketPlaceUrl" target="_blank">upgrade your current subscription</a> to resolve it.
          </div>
        </div>
      </div>
    </v-notice>
  </div>
</template>

<script lang="ts" setup>
import { storeToRefs } from 'pinia';
import { computed } from 'vue';
import { useLocalazyStore } from '../stores/localazy-store';
import { getConfig } from '../../../common/config/get-config';

defineProps({
  hasIncompleteConfiguration: {
    type: Boolean,
    required: true,
  },
});

const {
  exceededKeyLimit, localazyProject, lacksAccessToPlugin,
} = storeToRefs(useLocalazyStore());

const marketPlaceUrl = computed(() => {
  if (localazyProject.value) {
    return `https://localazy.com/o/${localazyProject.value.orgId}/billing/subscription-plans`;
  }
  return '';
});
const appMode = computed(() => getConfig().APP_MODE);
const isDemo = computed(() => getConfig().APP_MODE === 'demo');

</script>

<style scoped lang="scss">

  .message {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
  }

</style>
