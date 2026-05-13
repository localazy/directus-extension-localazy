import crypto from 'crypto';

/**
 * Maximum allowed age of a webhook timestamp, in milliseconds. Mirrors the Strapi
 * plugin's `THRESHOLD = 900000` so Localazy's protocol behaviour is identical across
 * connectors — requests older than 15 minutes are rejected as stale.
 */
export const WEBHOOK_TIMESTAMP_THRESHOLD_MS = 900_000;

/**
 * Header name carrying the HMAC-SHA256 signature of `${timestamp}-${JSON.stringify(body)}`.
 * Sent by Localazy with every webhook delivery.
 */
export const WEBHOOK_HMAC_HEADER = 'x-localazy-hmac';

/**
 * Header name carrying the Unix-seconds timestamp of when Localazy enqueued the delivery.
 * Used to reject replays beyond `WEBHOOK_TIMESTAMP_THRESHOLD_MS`.
 */
export const WEBHOOK_TIMESTAMP_HEADER = 'x-localazy-timestamp';

/**
 * Discriminated outcome of `verifyWebhookSignature`. The endpoint maps each `failed`
 * reason to a specific HTTP status:
 *   - `missing_headers` / `invalid_signature` → 401
 *   - `stale_timestamp` → 400
 * Keeping the failure modes explicit (rather than throwing) lets the caller log + respond
 * uniformly without try/catch noise.
 */
export type WebhookVerificationResult = { ok: true } | { ok: false; reason: 'missing_headers' | 'stale_timestamp' | 'invalid_signature' };

/**
 * Inputs the verifier needs. The body is passed as a parsed object — the verifier
 * re-serialises via `JSON.stringify(body)` to mirror the Strapi plugin's exact contract.
 * The body string therefore depends on Node's serialiser; both ends of the wire use V8,
 * so key ordering is preserved (V8 keeps insertion order for non-integer string keys).
 */
export type WebhookVerificationInput = {
  secret: string;
  body: unknown;
  hmacHeader: string | undefined;
  timestampHeader: string | undefined;
  /** Defaults to `Date.now()` — injectable so tests can pin a fixed clock. */
  now?: number;
};

/**
 * Verifies a Localazy webhook delivery against the project's secret. Mirrors Strapi's
 * `verify-webhook` middleware byte-for-byte:
 *   1. Both headers must be present.
 *   2. Timestamp must be a finite integer (Unix seconds) and within
 *      `WEBHOOK_TIMESTAMP_THRESHOLD_MS` of `now`.
 *   3. HMAC-SHA256 over `${timestamp}-${JSON.stringify(body)}` keyed by `secret` must
 *      hex-match the `x-localazy-hmac` header.
 *
 * Comparison uses `crypto.timingSafeEqual` to defend against timing-attack signal
 * leakage. We additionally compare length first because `timingSafeEqual` throws on
 * length mismatch — a length-mismatch failure is reported as `invalid_signature` (same
 * outcome as a byte mismatch).
 */
export function verifyWebhookSignature(input: WebhookVerificationInput): WebhookVerificationResult {
  const { secret, body, hmacHeader, timestampHeader } = input;
  const now = input.now ?? Date.now();

  if (!hmacHeader || !timestampHeader) {
    return { ok: false, reason: 'missing_headers' };
  }

  const timestampSeconds = Number.parseInt(timestampHeader, 10);
  if (!Number.isFinite(timestampSeconds)) {
    return { ok: false, reason: 'stale_timestamp' };
  }

  // Strapi compares as `timestamp * 1000 + THRESHOLD < Date.now()` — anything older
  // than the threshold is stale. Inclusive equality is treated as "still fresh" to
  // match Strapi's `<` (strictly older).
  if (timestampSeconds * 1000 + WEBHOOK_TIMESTAMP_THRESHOLD_MS < now) {
    return { ok: false, reason: 'stale_timestamp' };
  }

  // We accept future timestamps too: Strapi's check is one-sided (only rejects old).
  // Clock skew on Localazy's side is expected to be small; a request a few seconds in
  // the future is fine.

  const hmac = crypto.createHmac('sha256', secret);
  const expected = hmac.update(`${timestampHeader}-${JSON.stringify(body)}`).digest('hex');

  if (expected.length !== hmacHeader.length) {
    return { ok: false, reason: 'invalid_signature' };
  }

  try {
    const expectedBuf = Buffer.from(expected, 'utf8');
    const actualBuf = Buffer.from(hmacHeader, 'utf8');
    if (!crypto.timingSafeEqual(expectedBuf, actualBuf)) {
      return { ok: false, reason: 'invalid_signature' };
    }
  } catch {
    // `timingSafeEqual` only throws on length mismatch, which we already guarded
    // above — but the runtime guarantee is process-version-specific. Treat any
    // residual throw as a verification failure rather than letting it crash the
    // handler.
    return { ok: false, reason: 'invalid_signature' };
  }

  return { ok: true };
}
