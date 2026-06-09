import { ref, onMounted, onUnmounted } from 'vue';

const DEFAULT_TICK_MS = 30_000;

/**
 * Reactive wall-clock `now` ref that drives `computed`s reading `Date.now()`. Without
 * this, a `computed(() => Date.now() - someTimestamp > threshold)` only re-evaluates
 * when one of its other tracked deps changes — so cross-tab observers of a remote-held
 * lock can stay stuck on a stale state past the threshold. The interval is module-side
 * UI-only, cleared on unmount so it doesn't leak across route changes.
 */
export function useNow(tickMs: number = DEFAULT_TICK_MS) {
  const now = ref(Date.now());
  let handle: ReturnType<typeof setInterval> | null = null;
  onMounted(() => {
    handle = setInterval(() => {
      now.value = Date.now();
    }, tickMs);
  });
  onUnmounted(() => {
    if (handle) clearInterval(handle);
  });
  return now;
}
