<template>
  <div class="connection-overiew">
    <div class="flex items-center justify-between w-full">
      <div class="flex flex-col">
        <span class="font-medium">Localazy connection</span>
        <div class="flex items-center" v-if="isConnecting">
          <div class="rounded-full bg-warning w-4 h-4 mr-2" />
          <span class="font-medium">Connecting to Localazy</span>
        </div>

        <div class="flex items-center" v-else-if="isConnected">
          <div class="rounded-full bg-success w-4 h-4 mr-2" />
          <div class="text-foreground-normal font-normal">
            {{ localazyProject?.name }}
          </div>
        </div>

        <div class="flex items-center" v-else>
          <div class="rounded-full bg-danger w-4 h-4 mr-2" />
          <span class="font-medium">Not connected to Localazy</span>
        </div>

      </div>

      <div class="flex ">
        <v-icon
          name="sync"
          @click="onReconnect"
          class=" mr-2"
          :class="{
            'disabled-link': !hasLocalazyToken,
            'cursor-pointer': hasLocalazyToken,
          }"
          title="Reconnect to Localazy" />

        <component
          :is="isConnected ? 'a' : 'span'"
          :href="localazyProject?.url || undefined"
          target="_blank"
          class="open-link"
          title="Open Localazy project in a new tab."
          :class="{
            'disabled-link': !isConnected,
          }"
        >
          <v-icon name="open_in_new" />
        </component>

      </div>
    </div>

    <div v-if="isConnected" class="flex organization-overview">
      <div class="flex flex-col">
        <span class="font-medium">Directus Source language</span>
        <span class="font-normal">{{ settings?.source_language }} ({{ directusSourceLanguage?.name }})</span>
      </div>

      <div class="flex flex-col">
        <span class="font-medium">Localazy Source language</span>
        <span class="font-normal">{{ localazySourceLanguage?.locale }} ({{ localazySourceLanguage?.name }})</span>
      </div>

      <div class="flex flex-col">
        <span class="font-medium">Organization keys</span>
        <span
          class="font-normal"
          :class="{ 'over-key-limit': exceededKeyLimit }">
          {{ localazyProject?.organization.usedKeys }} / {{ localazyProject?.organization.availableKeys }}
        </span>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { storeToRefs } from 'pinia';
import { computed } from 'vue';
import { getLocalazyLanguages } from '../../../../common/functions/localazy-languages';
import { useLocalazyStore } from '../../stores/localazy-store';
import { DirectusLocalazyAdapter } from '../../../../common/services/directus-localazy-adapter';

const localazyStore = useLocalazyStore();
const {
  hydrate,
} = localazyStore;
const {
  hydrating, localazyProject, settings, exceededKeyLimit, localazyData,
} = storeToRefs(useLocalazyStore());

const isConnected = computed(() => !hydrating.value && !!localazyProject.value);
const hasLocalazyToken = computed(() => !!localazyData.value?.access_token);
const isConnecting = computed(() => hydrating.value);
const localazySourceLanguage = computed(() => getLocalazyLanguages()
  .find((lang) => lang.localazyId === localazyProject.value?.sourceLanguage));
const directusSourceLanguage = computed(() => {
  if (!settings.value?.source_language) return null;
  return findLocalazyLanguageByLocale(
    DirectusLocalazyAdapter.transformDirectusToLocalazyLanguage(settings.value.source_language),
  );
});

async function onReconnect() {
  if (hasLocalazyToken.value) {
    await hydrate({ force: true });
  }
}
</script>

<style lang="scss" scoped>
@import '../../styles/mixins/common';

.connection-overiew {
  @include common;
}

.disabled-link {
  opacity: 0.5;
  color: var(--foreground-subdued);
  fill: var(--foreground-subdued);
}

.source-language {
  margin-bottom: 1rem;
  @media (min-width: 960px) {
    margin-right: 18rem;
    margin-bottom: 0rem;
  }
}

.organization-overview {
  flex-direction: column;
  gap: 2rem;

  @media (min-width: 960px) {
    flex-direction: row;
    gap: 4rem;
  }

  margin-top: 1rem;
  border-top: 1px solid var(--border-normal);
  padding-top: 1rem;
}

.over-key-limit {
  color: var(--danger);
}
</style>
