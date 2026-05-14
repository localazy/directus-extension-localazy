/**
 * Dedupe helpers for the webhook-failure notification path.
 *
 * Background: a revoked Localazy access token causes every incoming `project_published`
 * webhook to fail the secret-fetch (401). Without dedupe, every retry would mint a fresh
 * `directus_notifications` row — 60+ identical notifications in the bell-icon dropdown
 * before the operator notices.
 *
 * Rule: skip the notification when the most-recent prior webhook-initiated session that
 * also ended in failure (`failed | partial | aborted`) finished within the dedupe window.
 * A successful webhook between two failures resets the dedupe — the most-recent prior
 * session is no longer a failure, so the next failure notifies.
 */

/**
 * Default window after a prior webhook failure during which the next failure is
 * suppressed. Hardcoded per the PR G plan — not user-configurable. 12 h is long enough
 * to cover an after-hours outage without burying the next-day's morning notification,
 * but short enough that the operator who acked the first failure still gets pinged
 * again if the problem reappears the following day.
 */
export const FAILURE_NOTIFICATION_WINDOW_MS = 12 * 60 * 60 * 1000;

/**
 * Pure decision: should the failure notification be suppressed?
 *
 * - No prior failure → emit (`false`).
 * - Prior failure with null `finished_at` → emit (defensive; the lookup should only
 *   surface finalised rows, but a race during finalise PATCH could in principle return
 *   a stale snapshot — better to over-notify than to silently swallow).
 * - Prior failure outside the window → emit.
 * - Prior failure inside the window → suppress.
 */
export function shouldSuppressFailureNotification(opts: {
  now: Date;
  mostRecentPriorFailure: { finished_at: string | null } | null;
  windowMs: number;
}): boolean {
  const { now, mostRecentPriorFailure, windowMs } = opts;
  if (!mostRecentPriorFailure) return false;
  if (!mostRecentPriorFailure.finished_at) return false;
  const finishedMs = Date.parse(mostRecentPriorFailure.finished_at);
  if (!Number.isFinite(finishedMs)) return false;
  return now.getTime() - finishedMs < windowMs;
}
