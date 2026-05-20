import { describe, it, expect, vi } from 'vitest';
import { useBundleStatus, type StatusFetcher } from './use-bundle-status';
import { BUNDLE_ENDPOINT_PREFIX } from '../data/constants';

/**
 * The Automation page treats 404 / network error / 5xx / malformed body all the same
 * way — render State A ("bundle not installed"). These tests assert that collapsing
 * behaviour explicitly so a regression that bubbles, say, a network error to the UI is
 * caught here rather than at runtime.
 */
describe('useBundleStatus', () => {
  function makeApi(handler: () => Promise<{ data: unknown }>): StatusFetcher {
    return { get: vi.fn(handler) as StatusFetcher['get'] };
  }

  it('hits the right URL', async () => {
    const get = vi.fn(async () => ({ data: { installed: true, version: '1.0.0' } }));
    const api: StatusFetcher = { get: get as StatusFetcher['get'] };
    const status = useBundleStatus(api);
    await status.check();
    expect(get).toHaveBeenCalledWith(`${BUNDLE_ENDPOINT_PREFIX}/status`);
  });

  it('marks installed when the endpoint responds with installed:true', async () => {
    const api = makeApi(async () => ({ data: { installed: true, version: '1.2.3' } }));
    const status = useBundleStatus(api);
    await status.check();
    expect(status.loading.value).toBe(false);
    expect(status.installed.value).toBe(true);
    expect(status.status.value).toEqual({ installed: true, version: '1.2.3' });
  });

  it('defaults version to empty string when the bundle response omits it', async () => {
    const api = makeApi(async () => ({ data: { installed: true } }));
    const status = useBundleStatus(api);
    await status.check();
    expect(status.installed.value).toBe(true);
    expect(status.status.value).toEqual({ installed: true, version: '' });
  });

  it('treats a 404 / rejected request as not installed', async () => {
    const api = makeApi(async () => {
      throw Object.assign(new Error('Not Found'), { response: { status: 404 } });
    });
    const status = useBundleStatus(api);
    await status.check();
    expect(status.installed.value).toBe(false);
    expect(status.status.value).toBeNull();
    expect(status.loading.value).toBe(false);
  });

  it('treats a network error (no response) as not installed', async () => {
    const api = makeApi(async () => {
      throw new Error('Network Error');
    });
    const status = useBundleStatus(api);
    await status.check();
    expect(status.installed.value).toBe(false);
    expect(status.status.value).toBeNull();
  });

  it('treats a 200 with installed:false / missing as not installed', async () => {
    const api = makeApi(async () => ({ data: { installed: false } }));
    const status = useBundleStatus(api);
    await status.check();
    expect(status.installed.value).toBe(false);
    expect(status.status.value).toBeNull();
  });

  it('check is idempotent across repeat calls', async () => {
    let calls = 0;
    const api = makeApi(async () => {
      calls += 1;
      return { data: { installed: true, version: `1.0.${calls}` } };
    });
    const status = useBundleStatus(api);
    await status.check();
    await status.check();
    expect(calls).toBe(2);
    expect(status.status.value?.version).toBe('1.0.2');
  });
});
