/**
 * Shared timing constants for the advisory sync lock. Centralised so the UI's "looks
 * stuck" affordance, the orchestrator's staleness check, and the lock tests all stay in
 * sync — there is one source of truth for each threshold.
 */

/**
 * Heartbeat cadence. While a sync holds the lock, the orchestrator bumps
 * `last_heartbeat_at` (and `sync_items_processed`) on this interval so external
 * contenders can tell a live run from a zombie one. 30 s balances DB write pressure
 * against detection latency — well under the 5 min staleness window.
 */
export const SYNC_LOCK_HEARTBEAT_MS = 30_000;

/**
 * Heartbeat-based staleness threshold. If the most recent heartbeat is older than this,
 * the lock holder is assumed dead and a contender may take over. Five minutes covers
 * Directus restarts, long GC pauses, and slow Localazy fetches without misclassifying a
 * busy run.
 */
export const SYNC_LOCK_STALE_HEARTBEAT_MS = 5 * 60 * 1000;

/**
 * Hard ceiling on a single run, measured from `sync_started_at`. Even with a fresh
 * heartbeat — e.g. a process spinning on a write loop without ever returning — a contender
 * may take over once the lock has been held this long. Two hours is well past any
 * legitimate sync size we've ever observed.
 */
export const SYNC_LOCK_HARD_CEILING_MS = 2 * 60 * 60 * 1000;

/**
 * Threshold the manual override surfaces against — the "Clear stuck sync" button in
 * AdvancedSettings only appears once the lock has been held this long. Matches the
 * heartbeat-staleness window so operators only see the affordance when the orchestrator's
 * own staleness check would already let a contender steal.
 */
export const SYNC_LOCK_STUCK_HINT_MS = SYNC_LOCK_STALE_HEARTBEAT_MS;

/**
 * Shared "is this lock dead?" predicate, evaluated against a `localazy_sync_state` row.
 * Mirrors the orchestrator's private `isLockStale` (which reads the internal `LockState`
 * shape) but operates on the persisted `sync_*` column names so the UI surfaces — the
 * Import button's disabled affordance and the Activity-detail terminate flow — classify a
 * lock identically to the orchestrator's own steal check. There is one staleness rule for
 * all three callers.
 *
 * Stale = `sync_started_at` older than the 2 h hard ceiling (zombie that keeps
 * heartbeating but never finishes) OR `sync_last_heartbeat_at` older than the 5 min
 * heartbeat window (dead worker / Directus restart). A null timestamp is never stale on
 * its own — a lock acquired microseconds ago hasn't heartbeated yet. Callers gate this
 * behind `sync_in_progress === true`.
 */
export function isSyncLockStale(state: { sync_started_at: string | null; sync_last_heartbeat_at: string | null }, now: number): boolean {
  if (state.sync_started_at) {
    const startedMs = Date.parse(state.sync_started_at);
    if (Number.isFinite(startedMs) && now - startedMs > SYNC_LOCK_HARD_CEILING_MS) return true;
  }
  if (state.sync_last_heartbeat_at) {
    const heartbeatMs = Date.parse(state.sync_last_heartbeat_at);
    if (Number.isFinite(heartbeatMs) && now - heartbeatMs > SYNC_LOCK_STALE_HEARTBEAT_MS) return true;
  }
  return false;
}
