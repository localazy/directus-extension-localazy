import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { verifyWebhookSignature, WEBHOOK_TIMESTAMP_THRESHOLD_MS, WEBHOOK_HMAC_HEADER, WEBHOOK_TIMESTAMP_HEADER } from './hmac-verification';

const SECRET = 'super-secret';

function sign(timestamp: string, body: unknown, secret = SECRET): string {
  return crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}-${JSON.stringify(body)}`)
    .digest('hex');
}

describe('verifyWebhookSignature', () => {
  it('returns ok=true for a valid signature within the freshness window', () => {
    const now = 1_700_000_000_000;
    const ts = Math.floor(now / 1000).toString();
    const body = { type: 'project_published', project: 'p1' };
    const sig = sign(ts, body);

    const result = verifyWebhookSignature({
      secret: SECRET,
      body,
      hmacHeader: sig,
      timestampHeader: ts,
      now,
    });
    expect(result).toEqual({ ok: true });
  });

  it('returns invalid_signature for a body-tampered request', () => {
    const now = 1_700_000_000_000;
    const ts = Math.floor(now / 1000).toString();
    const sig = sign(ts, { type: 'project_published' });
    const result = verifyWebhookSignature({
      secret: SECRET,
      body: { type: 'project_unpublished' }, // body differs from signature input
      hmacHeader: sig,
      timestampHeader: ts,
      now,
    });
    expect(result).toEqual({ ok: false, reason: 'invalid_signature' });
  });

  it('returns invalid_signature for a wrong secret', () => {
    const now = 1_700_000_000_000;
    const ts = Math.floor(now / 1000).toString();
    const body = { type: 'project_published' };
    const sig = sign(ts, body, 'wrong-secret');
    const result = verifyWebhookSignature({
      secret: SECRET,
      body,
      hmacHeader: sig,
      timestampHeader: ts,
      now,
    });
    expect(result).toEqual({ ok: false, reason: 'invalid_signature' });
  });

  it('returns stale_timestamp when older than the 15-minute window', () => {
    const now = 1_700_000_000_000;
    const staleSec = Math.floor((now - WEBHOOK_TIMESTAMP_THRESHOLD_MS - 1000) / 1000).toString();
    const body = {};
    const sig = sign(staleSec, body);
    const result = verifyWebhookSignature({
      secret: SECRET,
      body,
      hmacHeader: sig,
      timestampHeader: staleSec,
      now,
    });
    expect(result).toEqual({ ok: false, reason: 'stale_timestamp' });
  });

  it('returns ok=true for a request exactly at the boundary', () => {
    // The Strapi check is `timestamp * 1000 + THRESHOLD < Date.now()` — strictly older.
    // Exactly at the boundary is still fresh.
    const now = 1_700_000_000_000;
    const boundarySec = Math.floor((now - WEBHOOK_TIMESTAMP_THRESHOLD_MS) / 1000).toString();
    const body = {};
    const sig = sign(boundarySec, body);
    const result = verifyWebhookSignature({
      secret: SECRET,
      body,
      hmacHeader: sig,
      timestampHeader: boundarySec,
      now,
    });
    expect(result.ok).toBe(true);
  });

  it('returns stale_timestamp for a non-numeric timestamp', () => {
    const result = verifyWebhookSignature({
      secret: SECRET,
      body: {},
      hmacHeader: 'whatever',
      timestampHeader: 'not-a-number',
      now: Date.now(),
    });
    expect(result).toEqual({ ok: false, reason: 'stale_timestamp' });
  });

  it('returns missing_headers when hmacHeader is undefined', () => {
    const result = verifyWebhookSignature({
      secret: SECRET,
      body: {},
      hmacHeader: undefined,
      timestampHeader: '1',
      now: Date.now(),
    });
    expect(result).toEqual({ ok: false, reason: 'missing_headers' });
  });

  it('returns missing_headers when timestampHeader is undefined', () => {
    const result = verifyWebhookSignature({
      secret: SECRET,
      body: {},
      hmacHeader: 'abc',
      timestampHeader: undefined,
      now: Date.now(),
    });
    expect(result).toEqual({ ok: false, reason: 'missing_headers' });
  });

  it('uses Date.now() when `now` is omitted', () => {
    // Smoke-test the default path — a fresh signature with the wall clock should verify.
    const ts = Math.floor(Date.now() / 1000).toString();
    const sig = sign(ts, { ok: true });
    const result = verifyWebhookSignature({
      secret: SECRET,
      body: { ok: true },
      hmacHeader: sig,
      timestampHeader: ts,
    });
    expect(result.ok).toBe(true);
  });

  it('returns invalid_signature for a signature of the wrong length', () => {
    // Length-mismatch shouldn't crash `timingSafeEqual`; the verifier guards explicitly.
    const ts = Math.floor(Date.now() / 1000).toString();
    const result = verifyWebhookSignature({
      secret: SECRET,
      body: {},
      hmacHeader: 'abc',
      timestampHeader: ts,
      now: Date.now(),
    });
    expect(result).toEqual({ ok: false, reason: 'invalid_signature' });
  });
});

describe('constants', () => {
  it('threshold matches Strapi reference (15 minutes in ms)', () => {
    expect(WEBHOOK_TIMESTAMP_THRESHOLD_MS).toBe(900_000);
  });

  it('header names match Localazy protocol', () => {
    expect(WEBHOOK_HMAC_HEADER).toBe('x-localazy-hmac');
    expect(WEBHOOK_TIMESTAMP_HEADER).toBe('x-localazy-timestamp');
  });
});
