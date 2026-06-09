/**
 * Dedupe helpers for the webhook-failure notification path.
 *
 * Background: a persistent failure mode causes every incoming `project_published`
 * webhook to write a `'failed'` `localazy_sync_log` row — e.g. the customer deleted the
 * `localazy_content_transfer_setup` singleton, or the upstream Localazy project was
 * deleted, or the configured `automated_import_user` lost Admin role. Each of those
 * failures lands in the log (via `writeOutcomeSessionRow` for early-reject cases or via
 * the orchestrator's `finish()` for later failures). Without dedupe, every retry would
 * mint a fresh `directus_notifications` row — 60+ identical notifications in the
 * bell-icon dropdown before the operator notices.
 *
 * (HMAC-mismatch and secret-fetch failures do NOT participate in the dedupe — those
 * paths return 401/4xx without writing a log row, by design, to avoid letting an
 * unauthenticated attacker flood the Activity table or the notifications inbox.)
 *
 * Rule: skip the notification when the most-recent prior webhook-initiated failure (any
 * `failed`/`partial`/`aborted` status, ignoring successful rows in between) finished
 * within the last 12 hours. Successful syncs do NOT reset the dedupe — the lookup query
 * filters them out entirely, so they're invisible. The window is wall-clock from the
 * prior failure's `finished_at`, so once 12h elapses the next failure always notifies.
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
