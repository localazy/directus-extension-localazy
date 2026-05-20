import { describe, it, expect, vi, beforeEach } from 'vitest';

const throttleMocks = vi.hoisted(() => ({
  updateKey: vi.fn(),
}));

vi.mock('./localazy-api-throttle-service', () => ({
  LocalazyApiThrottleService: {
    updateKey: throttleMocks.updateKey,
  },
}));

import { deprecateLocalazyKeys } from './deprecate-localazy-keys';

describe('deprecateLocalazyKeys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    throttleMocks.updateKey.mockResolvedValue(undefined);
  });

  it('is a no-op when no key ids are supplied', async () => {
    await deprecateLocalazyKeys('tok', 'p1', []);

    expect(throttleMocks.updateKey).not.toHaveBeenCalled();
  });

  it('issues one updateKey call per id with deprecated=0 and the supplied project', async () => {
    await deprecateLocalazyKeys('tok', 'p1', ['k1', 'k2']);

    expect(throttleMocks.updateKey).toHaveBeenCalledTimes(2);
    expect(throttleMocks.updateKey).toHaveBeenNthCalledWith(1, 'tok', { project: 'p1', key: 'k1', deprecated: 0 });
    expect(throttleMocks.updateKey).toHaveBeenNthCalledWith(2, 'tok', { project: 'p1', key: 'k2', deprecated: 0 });
  });

  // The underlying createAsyncQueue swallows per-task rejections — by design, so one
  // failing updateKey doesn't abort the remaining deprecations. The helper inherits that
  // and therefore resolves cleanly even when individual API calls reject. The pipeline's
  // outcome stays 'deprecated' in this case; preserving the legacy behaviour of
  // BaseContentSynchronizationService.deprecateLocalazyKeys.
  it('swallows per-task API rejections rather than aborting the rest', async () => {
    throttleMocks.updateKey.mockRejectedValueOnce(new Error('boom on k1')).mockResolvedValueOnce(undefined);

    await expect(deprecateLocalazyKeys('tok', 'p1', ['k1', 'k2'])).resolves.toBeUndefined();

    expect(throttleMocks.updateKey).toHaveBeenCalledTimes(2);
  });
});
