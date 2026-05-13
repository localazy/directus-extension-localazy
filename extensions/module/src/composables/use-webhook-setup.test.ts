import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Webhook } from '@localazy/api-client';
import { useWebhookSetup, isLocalWebhookUrl, type WebhookClient } from './use-webhook-setup';
import { WEBHOOK_CUSTOM_ID, WEBHOOK_DESCRIPTION, WEBHOOK_EVENT } from '../data/constants';

/**
 * In-memory fake for the Localazy webhooks API. Stores the latest `update()` payload so
 * tests can assert the exact list-then-filter-then-upsert behaviour the production code
 * performs against the bulk-replace endpoint.
 */
function makeClient(initial: Webhook[] = []): WebhookClient & { items: Webhook[]; listCalls: number; updateCalls: number } {
  const state = { items: [...initial], listCalls: 0, updateCalls: 0 };
  return {
    items: state.items,
    get listCalls() {
      return state.listCalls;
    },
    get updateCalls() {
      return state.updateCalls;
    },
    list: vi.fn(async () => {
      state.listCalls += 1;
      return [...state.items];
    }),
    update: vi.fn(async (items: Webhook[]) => {
      state.updateCalls += 1;
      state.items.splice(0, state.items.length, ...items);
    }),
  };
}

describe('isLocalWebhookUrl', () => {
  it.each([
    ['http://localhost:8055/foo', true],
    ['https://127.0.0.1/foo', true],
    ['http://0.0.0.0/foo', true],
    ['http://10.0.0.5/foo', true],
    ['http://172.16.0.1/foo', true],
    ['http://172.31.255.1/foo', true],
    ['http://192.168.1.1/foo', true],
    ['https://example.com/foo', false],
    ['https://abc.ngrok.io/foo', false],
    ['http://172.32.0.1/foo', false], // outside the 172.16-31 private range
  ])('classifies %s correctly', (url, expected) => {
    expect(isLocalWebhookUrl(url)).toBe(expected);
  });
});

describe('useWebhookSetup', () => {
  let client: ReturnType<typeof makeClient>;

  beforeEach(() => {
    client = makeClient();
  });

  it('starts in loading state and transitions to not_configured when no entry exists', async () => {
    const hook = useWebhookSetup(client);
    expect(hook.state.value).toBe('loading');
    await hook.refresh();
    expect(hook.state.value).toBe('not_configured');
    expect(hook.configuredUrl.value).toBe('');
  });

  it('transitions to configured when an entry with our customId exists', async () => {
    client = makeClient([{ enabled: true, customId: WEBHOOK_CUSTOM_ID, url: 'https://example.com/hook', events: [WEBHOOK_EVENT] }]);
    const hook = useWebhookSetup(client);
    await hook.refresh();
    expect(hook.state.value).toBe('configured');
    expect(hook.configuredUrl.value).toBe('https://example.com/hook');
  });

  it('ignores entries owned by other extensions (different customId)', async () => {
    client = makeClient([
      { enabled: true, customId: 'some-other-extension', url: 'https://strapi.example.com/hook', events: [WEBHOOK_EVENT] },
    ]);
    const hook = useWebhookSetup(client);
    await hook.refresh();
    expect(hook.state.value).toBe('not_configured');
  });

  it('setup() upserts our entry while preserving entries from other extensions', async () => {
    const other: Webhook = {
      enabled: true,
      customId: 'some-other-extension',
      url: 'https://other.example.com/hook',
      events: [WEBHOOK_EVENT],
    };
    client = makeClient([other]);
    const hook = useWebhookSetup(client);
    await hook.refresh();
    await hook.setup('https://my.example.com/hook');

    expect(hook.state.value).toBe('configured');
    expect(hook.configuredUrl.value).toBe('https://my.example.com/hook');
    expect(client.items).toHaveLength(2);
    expect(client.items.find((w) => w.customId === 'some-other-extension')).toBeDefined();
    const ours = client.items.find((w) => w.customId === WEBHOOK_CUSTOM_ID);
    expect(ours).toEqual({
      enabled: true,
      customId: WEBHOOK_CUSTOM_ID,
      url: 'https://my.example.com/hook',
      events: [WEBHOOK_EVENT],
      description: WEBHOOK_DESCRIPTION,
    });
  });

  it('setup() replaces an existing entry of ours (reconfigure path)', async () => {
    client = makeClient([{ enabled: true, customId: WEBHOOK_CUSTOM_ID, url: 'https://old.example.com/hook', events: [WEBHOOK_EVENT] }]);
    const hook = useWebhookSetup(client);
    await hook.refresh();
    await hook.setup('https://new.example.com/hook');

    expect(client.items).toHaveLength(1);
    expect(client.items[0]!.url).toBe('https://new.example.com/hook');
  });

  it('remove() drops our entry but preserves others', async () => {
    const other: Webhook = {
      enabled: true,
      customId: 'some-other-extension',
      url: 'https://other.example.com/hook',
      events: [WEBHOOK_EVENT],
    };
    client = makeClient([
      other,
      { enabled: true, customId: WEBHOOK_CUSTOM_ID, url: 'https://my.example.com/hook', events: [WEBHOOK_EVENT] },
    ]);
    const hook = useWebhookSetup(client);
    await hook.refresh();
    await hook.remove();

    expect(hook.state.value).toBe('not_configured');
    expect(hook.configuredUrl.value).toBe('');
    expect(client.items).toEqual([other]);
  });

  it('refresh() collapses a list failure to not_configured and records the error', async () => {
    // Bespoke client for this case — we only need the failing `list`, no in-memory state.
    // Typing it as `WebhookClient` directly avoids the `as unknown as` double-cast.
    const failingClient: WebhookClient = {
      list: vi.fn(async () => {
        throw new Error('boom');
      }),
      update: vi.fn(async () => {}),
    };
    const hook = useWebhookSetup(failingClient);
    await hook.refresh();
    expect(hook.state.value).toBe('not_configured');
    expect(hook.error.value).toBeInstanceOf(Error);
  });

  it('setup() re-throws on update failure and surfaces error', async () => {
    const failingClient: WebhookClient = {
      list: vi.fn(async () => []),
      update: vi.fn(async () => {
        throw new Error('update failed');
      }),
    };
    const hook = useWebhookSetup(failingClient);
    await hook.refresh();
    await expect(hook.setup('https://x.example.com/hook')).rejects.toThrow('update failed');
    expect(hook.error.value).toBeInstanceOf(Error);
    expect(hook.state.value).toBe('not_configured');
  });

  it('saving flips true during setup() and back to false after', async () => {
    let resolveUpdate!: () => void;
    const blocking: WebhookClient = {
      list: vi.fn(async () => []),
      update: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveUpdate = resolve;
          }),
      ),
    };
    const hook = useWebhookSetup(blocking);
    await hook.refresh();
    const promise = hook.setup('https://x.example.com/hook');
    // Yield once so the await client.list() inside setup() resolves
    await Promise.resolve();
    await Promise.resolve();
    expect(hook.saving.value).toBe(true);
    resolveUpdate();
    await promise;
    expect(hook.saving.value).toBe(false);
  });
});
