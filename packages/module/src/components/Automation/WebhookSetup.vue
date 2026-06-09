<template>
  <div class="webhook-setup">
    <div v-if="state === 'loading'" class="loading">
      <v-progress-circular indeterminate small />
      <span>Checking webhook status…</span>
    </div>

    <v-notice v-else-if="state === 'configured'" type="success" class="notice">
      <div>
        <p class="notice-title">Webhook registered with Localazy</p>
        <p class="notice-url">{{ configuredUrl }}</p>
      </div>
    </v-notice>

    <v-notice v-else type="info" class="notice">
      No webhook is registered for this Localazy project yet. Set one up so Localazy can notify your Directus instance when translations are
      published.
    </v-notice>

    <div v-if="state !== 'loading'" class="actions">
      <v-button v-if="state === 'not_configured'" :loading="saving" @click="openDialog">Set up webhook</v-button>
      <template v-else-if="state === 'configured'">
        <v-button :loading="saving" secondary @click="openDialog">Reconfigure</v-button>
        <v-button :loading="saving" kind="warning" secondary @click="showRemoveConfirm = true">Remove webhook</v-button>
      </template>
    </div>

    <v-dialog v-model="showDialog" @esc="showDialog = false">
      <v-card class="setup-card">
        <v-card-title>Set up Localazy webhook</v-card-title>
        <v-card-text>
          <ol class="steps">
            <li>
              <p class="step-title">1. Make sure the Directus instance is reachable from Localazy.</p>
              <p class="step-description">
                Localazy posts events to this URL whenever a translation is published. The instance must be reachable from the public
                internet — local URLs require a tunnel such as ngrok.
              </p>
            </li>
            <li>
              <p class="step-title">2. Confirm the webhook URL.</p>
              <v-input v-model="dialogUrl" />
              <div v-if="isLocalWebhookUrl(dialogUrl)" class="warning-note">
                <v-icon name="warning" small />
                <span>
                  This URL is on a local / private network and Localazy can't reach it from the public internet. Use ngrok (or similar) and
                  paste the public URL here for development testing.
                </span>
              </div>
              <p class="step-description">
                Defaults to <code>{{ defaultWebhookUrl }}</code>
              </p>
              <v-notice type="info" class="proxy-note">
                If Directus runs behind a reverse proxy or at a sub-path, edit the URL above to match your public hostname. The pre-filled
                URL uses your browser's current origin.
              </v-notice>
            </li>
            <li>
              <p class="step-title">3. Confirm. We'll register the webhook on Localazy under this project.</p>
              <p class="step-description">
                Any existing webhooks you've registered for other integrations remain untouched — we only manage entries with our own
                identifier.
              </p>
            </li>
          </ol>
          <div v-if="error" class="dialog-error">
            <v-notice type="danger">{{ errorMessage }}</v-notice>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-button secondary @click="showDialog = false">Cancel</v-button>
          <v-button :loading="saving" :disabled="!dialogUrl" @click="confirmSetup">Confirm setup</v-button>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="showRemoveConfirm" @esc="showRemoveConfirm = false">
      <v-card>
        <v-card-title>Remove webhook?</v-card-title>
        <v-card-text> Localazy will stop posting events to this Directus instance. You can set it up again at any time. </v-card-text>
        <v-card-actions>
          <v-button secondary @click="showRemoveConfirm = false">Cancel</v-button>
          <v-button :loading="saving" kind="warning" @click="confirmRemove">Remove webhook</v-button>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useLocalazyStore } from '../../stores/localazy-store';
import { useLocalazyConfigStore } from '../../stores/localazy-config-store';
import { useDirectusNotificationsStore } from '../../composables/use-directus-stores';
import { useWebhookSetup, isLocalWebhookUrl, type WebhookClient } from '../../composables/use-webhook-setup';
import { LocalazyApiThrottleService } from '@localazy/directus-common';
import { BUNDLE_WEBHOOK_PATH } from '../../data/constants';

const { localazyProject } = storeToRefs(useLocalazyStore());
const { data: localazyData } = storeToRefs(useLocalazyConfigStore());
const notifications = useDirectusNotificationsStore();

/**
 * Default URL we pre-fill in the setup dialog. We use `window.location.origin` rather
 * than reading `directus_settings.public_url` because the latter isn't guaranteed to be
 * set on a fresh install and round-tripping through the Directus API just to read it
 * adds a request for no UX gain — the operator is opening this page in the same browser
 * they want Localazy to reach. The local-URL warning below catches the common
 * "I forgot to set up a tunnel" mistake.
 */
const defaultWebhookUrl = computed(() => `${window.location.origin}${BUNDLE_WEBHOOK_PATH}`);

/**
 * Thin wrapper that binds `LocalazyApiThrottleService` to the current project + token at
 * call time. Keeps the composable independent of the throttle service so it stays unit-
 * testable, and refreshes the binding implicitly each time `list`/`update` is invoked
 * (token rotation is rare but possible).
 */
const client = computed<WebhookClient>(() => ({
  list: () => {
    const token = localazyData.value.access_token;
    const projectId = localazyProject.value?.id ?? '';
    if (!token || !projectId) return Promise.resolve([]);
    return LocalazyApiThrottleService.listWebhooks(token, { project: projectId });
  },
  update: (items) => {
    const token = localazyData.value.access_token;
    const projectId = localazyProject.value?.id ?? '';
    if (!token || !projectId) return Promise.resolve();
    return LocalazyApiThrottleService.updateWebhooks(token, { project: projectId, items });
  },
}));

const { state, configuredUrl, error, saving, refresh, setup, remove } = useWebhookSetup({
  list: () => client.value.list(),
  update: (items) => client.value.update(items),
});

const showDialog = ref(false);
const showRemoveConfirm = ref(false);
const dialogUrl = ref('');

function openDialog() {
  // Pre-fill with the currently registered URL when reconfiguring, otherwise the default.
  dialogUrl.value = configuredUrl.value || defaultWebhookUrl.value;
  showDialog.value = true;
}

async function confirmSetup() {
  try {
    await setup(dialogUrl.value);
    showDialog.value = false;
    notifications.add({ title: 'Webhook registered with Localazy', type: 'success' });
  } catch {
    // Error already captured in `error.value` and surfaced in the dialog body.
  }
}

async function confirmRemove() {
  try {
    await remove();
    showRemoveConfirm.value = false;
    notifications.add({ title: 'Webhook removed', type: 'success' });
  } catch {
    showRemoveConfirm.value = false;
    notifications.add({ title: 'Failed to remove webhook', type: 'error' });
  }
}

const errorMessage = computed(() => {
  if (!error.value) return '';
  const err = error.value;
  if (err instanceof Error) return err.message;
  return 'Failed to update the webhook. Check the URL and try again.';
});

// Re-fetch on first mount and whenever the project ID hydrates or changes. `refresh()`
// itself handles the no-project case via the underlying client (short-circuits to `[]`)
// and flips `loading` to `false`, so we don't gate on `projectId` here — gating would
// leave the spinner stuck if the bundle is installed but no Localazy project is
// connected (e.g. user opens Automation before completing OAuth).
watch(
  () => localazyProject.value?.id,
  () => void refresh(),
  { immediate: true },
);
</script>

<style lang="scss" scoped>
.webhook-setup {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.loading {
  display: flex;
  gap: 8px;
  align-items: center;
  color: var(--theme--foreground);
  font-size: 14px;
}

.notice {
  width: 100%;
}

.notice-title {
  font-weight: 600;
  margin-bottom: 4px;
}

.notice-url {
  font-family: var(--theme--fonts--monospace--font-family);
  font-size: 13px;
  color: var(--theme--foreground);
  word-break: break-all;
}

.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.setup-card {
  min-width: 480px;
  max-width: 720px;
}

.steps {
  padding-left: 0;
  margin: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.step-title {
  font-weight: 600;
  margin: 0 0 6px 0;
}

.step-description {
  margin: 6px 0 0 0;
  font-size: 13px;
  color: var(--theme--foreground);

  code {
    background: var(--theme--background-subdued);
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 12px;
  }
}

.warning-note {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin-top: 8px;
  padding: 8px 12px;
  background: var(--warning-25, var(--theme--background-subdued));
  border: 1px solid var(--warning-50, var(--theme--border-color-subdued));
  border-radius: var(--theme--border-radius);
  color: var(--warning, var(--theme--foreground));
  font-size: 13px;
  line-height: 1.4;
}

.dialog-error {
  margin-top: 16px;
}

.proxy-note {
  margin-top: 12px;
}
</style>
