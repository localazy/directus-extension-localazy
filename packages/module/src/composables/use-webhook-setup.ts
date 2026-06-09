import { computed, ref, type ComputedRef, type Ref } from 'vue';
import type { Webhook } from '@localazy/api-client';
import { WEBHOOK_CUSTOM_ID, WEBHOOK_DESCRIPTION, WEBHOOK_EVENT } from '../data/constants';

/**
 * Three render states for the `WebhookSetup` widget. Mirrors Strapi's identical setup
 * page — `loading` covers the initial list call, `configured` shows the registered URL
 * with reconfigure / remove affordances, `not_configured` shows the install prompt.
 */
export type WebhookSetupState = 'loading' | 'configured' | 'not_configured';

/**
 * Minimal contract over the Localazy webhooks API this composable needs. Implemented in
 * production by `LocalazyApiThrottleService.{list,update}Webhooks`; in tests the consumer
 * passes a fake. Keeps the composable free of any `useStore` / runtime dependency so it
 * can be unit-tested in isolation.
 */
export type WebhookClient = {
  list: () => Promise<Webhook[]>;
  /** Replaces the full webhook collection — Localazy's API only exposes a bulk update. */
  update: (items: Webhook[]) => Promise<void>;
};

export type WebhookSetupApi = {
  state: ComputedRef<WebhookSetupState>;
  /** The URL currently registered for this extension's webhook, if any. */
  configuredUrl: Ref<string>;
  /** Last error from refresh / setup / remove, surfaced under the form. Null when clean. */
  error: Ref<unknown>;
  /** True while a save / remove is in flight (drives button spinners). */
  saving: Ref<boolean>;
  /** Refresh the registered-webhook state. Consumer calls on mount and on project-id changes; safe to call repeatedly. */
  refresh: () => Promise<void>;
  /**
   * Upsert this extension's webhook. Lists existing entries, filters ours out by
   * `customId`, and writes the merged list back via the API client. Mirrors Strapi's
   * pattern — Localazy's webhooks endpoint is bulk-replace, so we have to preserve the
   * operator's other entries.
   */
  setup: (url: string) => Promise<void>;
  /** Remove this extension's webhook entry, preserving any other entries on the project. */
  remove: () => Promise<void>;
};

/**
 * Heuristic for "is this URL one Localazy can't reach?" — used to surface a warning in
 * the setup dialog. Strapi uses the same regex; aligning keeps the two extensions'
 * UX consistent. We accept false-positives over false-negatives: e.g. `192.168.x.x` is
 * unreachable from the public internet 99.9% of the time, so flagging it as local is
 * the right call even when an operator runs an exotic tunnel.
 */
const LOCAL_URL_REGEX = /^https?:\/\/(localhost|127\.|0\.0\.0\.0|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|\[::1\]|\[fe80:)/i;

export function isLocalWebhookUrl(url: string): boolean {
  return LOCAL_URL_REGEX.test(url);
}

/**
 * Stateful composable backing the `WebhookSetup` widget. Owns the three-state machine
 * (loading → not_configured / configured) plus the upsert / remove flow.
 *
 * The widget itself is a thin Vue shell — buttons, dialog, notice copy. All state
 * transitions and the Localazy API plumbing live here so they can be unit-tested without
 * mounting a component.
 *
 * @param client  Pre-wrapped Localazy webhooks API for this project + token. The widget
 *                constructs it from `LocalazyApiThrottleService` + the active project ID;
 *                tests pass a fake.
 */
export function useWebhookSetup(client: WebhookClient): WebhookSetupApi {
  const loading = ref(true);
  const saving = ref(false);
  const error = ref<unknown>(null);
  const configuredUrl = ref('');

  const state = computed<WebhookSetupState>(() => {
    if (loading.value) return 'loading';
    return configuredUrl.value ? 'configured' : 'not_configured';
  });

  async function refresh(): Promise<void> {
    loading.value = true;
    try {
      const items = await client.list();
      const ours = items.find((w) => w.customId === WEBHOOK_CUSTOM_ID);
      configuredUrl.value = ours?.url ?? '';
      error.value = null;
    } catch (e: unknown) {
      // Surface as "not configured" so the user can still try to register one — we don't
      // want a transient list failure to block the setup affordance entirely.
      configuredUrl.value = '';
      error.value = e;
    } finally {
      loading.value = false;
    }
  }

  async function setup(url: string): Promise<void> {
    saving.value = true;
    error.value = null;
    try {
      const existing = await client.list();
      const others = existing.filter((w) => w.customId !== WEBHOOK_CUSTOM_ID);
      const next: Webhook[] = [
        ...others,
        {
          enabled: true,
          customId: WEBHOOK_CUSTOM_ID,
          url,
          events: [WEBHOOK_EVENT],
          description: WEBHOOK_DESCRIPTION,
        },
      ];
      await client.update(next);
      configuredUrl.value = url;
    } catch (e: unknown) {
      error.value = e;
      throw e;
    } finally {
      saving.value = false;
    }
  }

  async function remove(): Promise<void> {
    saving.value = true;
    error.value = null;
    try {
      const existing = await client.list();
      const others = existing.filter((w) => w.customId !== WEBHOOK_CUSTOM_ID);
      await client.update(others);
      configuredUrl.value = '';
    } catch (e: unknown) {
      error.value = e;
      throw e;
    } finally {
      saving.value = false;
    }
  }

  return { state, configuredUrl, error, saving, refresh, setup, remove };
}
