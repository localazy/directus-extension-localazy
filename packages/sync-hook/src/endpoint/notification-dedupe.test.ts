import { describe, it, expect } from 'vitest';
import { shouldSuppressFailureNotification, FAILURE_NOTIFICATION_WINDOW_MS } from './notification-dedupe';

describe('shouldSuppressFailureNotification', () => {
  const now = new Date('2025-06-01T12:00:00.000Z');

  it('returns false when there is no prior failure', () => {
    expect(
      shouldSuppressFailureNotification({
        now,
        mostRecentPriorFailure: null,
        windowMs: FAILURE_NOTIFICATION_WINDOW_MS,
      }),
    ).toBe(false);
  });

  it('returns true when the prior failure is inside the window', () => {
    // 30 minutes ago — well within 12h.
    const finished = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
    expect(
      shouldSuppressFailureNotification({
        now,
        mostRecentPriorFailure: { finished_at: finished },
        windowMs: FAILURE_NOTIFICATION_WINDOW_MS,
      }),
    ).toBe(true);
  });

  it('returns false when the prior failure is outside the window', () => {
    // 13 hours ago — past the 12h cut-off.
    const finished = new Date(now.getTime() - 13 * 60 * 60 * 1000).toISOString();
    expect(
      shouldSuppressFailureNotification({
        now,
        mostRecentPriorFailure: { finished_at: finished },
        windowMs: FAILURE_NOTIFICATION_WINDOW_MS,
      }),
    ).toBe(false);
  });

  it('returns false when the prior failure has a null finished_at', () => {
    // Defensive — a finalise-PATCH race could in theory surface a row that has been
    // selected but not yet had `finished_at` written. Treat as "not suppressing" so the
    // user gets the notification.
    expect(
      shouldSuppressFailureNotification({
        now,
        mostRecentPriorFailure: { finished_at: null },
        windowMs: FAILURE_NOTIFICATION_WINDOW_MS,
      }),
    ).toBe(false);
  });

  it('returns false when finished_at is unparseable', () => {
    expect(
      shouldSuppressFailureNotification({
        now,
        mostRecentPriorFailure: { finished_at: 'not-a-date' },
        windowMs: FAILURE_NOTIFICATION_WINDOW_MS,
      }),
    ).toBe(false);
  });

  it('respects a custom windowMs (boundary case: exactly at the window)', () => {
    // Exactly windowMs ago — not suppressed (strict `<` comparison).
    const finished = new Date(now.getTime() - FAILURE_NOTIFICATION_WINDOW_MS).toISOString();
    expect(
      shouldSuppressFailureNotification({
        now,
        mostRecentPriorFailure: { finished_at: finished },
        windowMs: FAILURE_NOTIFICATION_WINDOW_MS,
      }),
    ).toBe(false);
  });
});
