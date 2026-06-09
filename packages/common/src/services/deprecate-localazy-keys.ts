import { LocalazyApiThrottleService } from './localazy-api-throttle-service';
import { createAsyncQueue } from '../utilities/async-queue';

/**
 * Pure helper that marks the given Localazy keys as deprecated. Used by the Automated
 * deprecation pipeline; both Directus-collection and translation-string deletion paths
 * project down to a flat list of Localazy key ids before calling this.
 *
 * Empty `keyIds` is a no-op — callers don't need to pre-check.
 *
 * The 100 ms inter-request delay preserves the throttling the original
 * `BaseContentSynchronizationService.deprecateLocalazyKeys` applied.
 */
export async function deprecateLocalazyKeys(accessToken: string, projectId: string, keyIds: string[]): Promise<void> {
  if (keyIds.length === 0) {
    return;
  }
  const { add, execute } = createAsyncQueue();
  keyIds.forEach((keyId) => {
    add(async () => {
      await LocalazyApiThrottleService.updateKey(accessToken, {
        project: projectId,
        key: keyId,
        deprecated: 0,
      });
    });
  });
  await execute({ delayBetween: 100 });
}
