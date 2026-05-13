import { ref, type Ref } from 'vue';
import { BUNDLE_ENDPOINT_PREFIX } from '../data/constants';

/**
 * Shape returned by the server-side bundle's `GET /localazy-automation/status` route.
 * The endpoint is intentionally trivial — see `extensions/sync-hook/src/endpoint/index.ts`.
 * The module pings it to detect whether the bundle is installed and reachable; everything
 * else (HMAC verification, gating, language resolution) happens server-side in PR F.
 */
export type BundleStatus = {
  installed: boolean;
  version: string;
};

export type BundleStatusState = {
  /** True while the initial status check is in flight. */
  loading: Ref<boolean>;
  /** Parsed response body once the check resolves with a 2xx. Null otherwise. */
  status: Ref<BundleStatus | null>;
  /** `true` iff the bundle responded successfully — drives the State A/B switch. */
  installed: Ref<boolean>;
  /** Re-run the status check. The Automation page calls this after a manual install. */
  check: () => Promise<void>;
};

/**
 * Minimal axios-like contract this composable depends on. Matches the subset of
 * `ReturnType<typeof useApi>` we actually use, which lets the unit test pass a tiny fake
 * without bridging to the full `AxiosInstance` type.
 */
export type StatusFetcher = {
  get: <T>(url: string) => Promise<{ data: T }>;
};

/**
 * Pings the bundle's `/status` endpoint and exposes the result as reactive refs. Returns
 * `installed: false` on any failure — 404 (bundle absent / not loaded), network error,
 * 500, or a malformed body — because from the UI's perspective they're all equivalent:
 * "we can't talk to the bundle, so render the install guide". The page surfaces the
 * version string on success so an operator can confirm at a glance they have the build
 * they expect.
 *
 * Extracted as a composable so the logic is testable without mounting a Vue component.
 */
export function useBundleStatus(api: StatusFetcher): BundleStatusState {
  const loading = ref(true);
  const status = ref<BundleStatus | null>(null);
  const installed = ref(false);

  async function check(): Promise<void> {
    loading.value = true;
    try {
      const result = await api.get<BundleStatus>(`${BUNDLE_ENDPOINT_PREFIX}/status`);
      // The endpoint always returns `installed: true` when present — the field exists
      // mainly to make the response self-describing, not to expose a real toggle. Treat
      // a missing or non-true value the same as a 404: the bundle isn't usable.
      if (result.data?.installed === true) {
        status.value = { installed: true, version: result.data.version ?? '' };
        installed.value = true;
      } else {
        status.value = null;
        installed.value = false;
      }
    } catch {
      // Any failure (404, network, 5xx, parse) collapses to "not installed". We don't
      // surface the error to the user — the install guide is the actionable next step
      // regardless of which failure mode tripped the check.
      status.value = null;
      installed.value = false;
    } finally {
      loading.value = false;
    }
  }

  return { loading, status, installed, check };
}
