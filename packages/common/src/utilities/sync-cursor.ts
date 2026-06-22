import { Key } from '@localazy/api-client';
import { SyncCursor } from '../models/collections-data/sync-state';

/**
 * Helpers around the download-sync cursor. The cursor is a per-language high-water mark:
 * `{ [lang]: maxEvent }`, where `maxEvent` is the largest Localazy modification `event`
 * we've confirmed-imported for that language. On the next sync we fetch only keys whose
 * `event` is greater than the watermark.
 *
 * This mirrors Localazy's own incremental-sync contract (`listKeysSinceEvent` /
 * `sinceEvent` / `maxEvent`): a single scalar per request, not a per-key map. The previous
 * per-`(lang, keyId)` representation grew unbounded (one entry per translated key × every
 * language) and overflowed the `processed_keys` TEXT column on large projects — the column
 * stays `text`, but the watermark keeps its contents to a handful of numbers.
 *
 * Everything here is pure and synchronous; orchestration (loading the singleton, persisting
 * back) lives at the call site.
 */

export function createEmptyCursor(): SyncCursor {
  return { processed_keys: {} };
}

/**
 * Parse the JSON-encoded watermark map stored in `localazy_sync_state.processed_keys`.
 * Returns an empty cursor for any malformed input — the cursor is best-effort cache, not
 * authoritative state, so we never throw and never let a corrupt row block sync.
 *
 * Forward-migration: older installs stored a per-key map (`{ [lang]: { [keyId]: event } }`).
 * Such a language's value is an object, not a number, so it's dropped here — that language
 * simply re-syncs in full once, after which the compact watermark is written back. The
 * worst case is "re-download that language's keys once", which is the safe fallback.
 */
export function parseCursor(raw: string | null | undefined): SyncCursor {
  if (!raw) return createEmptyCursor();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return createEmptyCursor();
    const processed: SyncCursor['processed_keys'] = {};
    for (const [lang, value] of Object.entries(parsed as Record<string, unknown>)) {
      // Only a finite number is a valid watermark. Legacy per-key objects (or any other
      // shape) are skipped, forcing a clean re-sync for that language.
      if (typeof value === 'number' && Number.isFinite(value)) {
        processed[lang] = value;
      }
    }
    return { processed_keys: processed };
  } catch {
    return createEmptyCursor();
  }
}

export function serializeCursor(cursor: SyncCursor): string {
  return JSON.stringify(cursor.processed_keys);
}

/**
 * Returns true iff the cursor was last written against the same Localazy project we're
 * about to sync. Empty `storedProjectId` is treated as "no recorded project" (first sync),
 * so the cursor is acceptable.
 */
export function cursorMatchesProject(storedProjectId: string, currentProjectId: string): boolean {
  if (!storedProjectId) return true;
  return storedProjectId === currentProjectId;
}

/**
 * Filter keys for a single language down to those that need (re-)downloading according to
 * the per-language watermark.
 *
 * Rule:
 *   - No watermark for the language (`undefined`) → include everything (first sync).
 *   - Key has no `event` (server omitted it) → include (safe mode).
 *   - Otherwise include iff `key.event > watermark`.
 *
 * The "include on undefined" rules degrade to "always download" rather than "always skip"
 * if either side ever stops echoing `event`.
 */
export function filterKeysByEventCursor(keys: Key[], watermark: number | undefined): Key[] {
  if (watermark === undefined) return keys;
  return keys.filter((k) => {
    if (k.event === undefined) return true;
    return k.event > watermark;
  });
}

/**
 * Failure-safe watermark advance for one language. Returns the largest event `E` such that
 * every key with `event <= E` has been successfully imported — in a prior run (`prev`) or
 * among this run's `succeededEvents` — while never reaching or passing the earliest
 * `failedEvents`. Keeping the watermark below the first failure guarantees failed keys (and
 * the few succeeded keys after them) are re-fetched next run, preserving exact retry without
 * a per-key map.
 *
 * Returns `undefined` only when there was no prior watermark and nothing could be confirmed
 * below the first failure — the caller then leaves that language uncursored (full re-sync).
 */
export function advanceWatermark(prev: number | undefined, succeededEvents: number[], failedEvents: number[]): number | undefined {
  let minFailed = Number.POSITIVE_INFINITY;
  for (const e of failedEvents) {
    if (e < minFailed) minFailed = e;
  }
  let result = prev;
  for (const e of succeededEvents) {
    if (e < minFailed && (result === undefined || e > result)) {
      result = e;
    }
  }
  return result;
}

/**
 * Build the new cursor from the base (loaded) watermark plus this run's per-language
 * success/failure events. A language where nothing could be confirmed and that had no prior
 * watermark is omitted entirely, so it re-syncs in full next time rather than silently
 * advancing past unconfirmed keys.
 */
export function buildWatermarkCursor(
  base: SyncCursor,
  succeededByLang: Map<string, number[]>,
  failedByLang: Map<string, number[]>,
): SyncCursor {
  const processed: SyncCursor['processed_keys'] = {};
  const langs = new Set<string>([...Object.keys(base.processed_keys), ...succeededByLang.keys(), ...failedByLang.keys()]);
  for (const lang of langs) {
    const w = advanceWatermark(base.processed_keys[lang], succeededByLang.get(lang) ?? [], failedByLang.get(lang) ?? []);
    if (w !== undefined) processed[lang] = w;
  }
  return { processed_keys: processed };
}

/**
 * Per-language right-biased merge used by the persist adapters. The just-computed cursor
 * (`inMemory`) wins; languages present only on disk (not touched this run) are preserved.
 *
 * We deliberately do NOT take `max(event)`: a run that hit a failure intentionally holds its
 * watermark below the failing event, and a higher pre-failure value still on disk must not
 * override it (that would skip the failed key forever). The advisory sync lock serialises
 * runs, so `disk` is what the orchestrator loaded as its base and `inMemory` already folded
 * it in via `advanceWatermark`. Pure — neither input is mutated.
 */
export function mergeCursor(disk: SyncCursor, inMemory: SyncCursor): SyncCursor {
  return { processed_keys: { ...disk.processed_keys, ...inMemory.processed_keys } };
}

/**
 * Number of languages carrying a watermark. Debug / inspection only — not used for
 * correctness.
 */
export function countCursorEntries(cursor: SyncCursor): number {
  return Object.keys(cursor.processed_keys).length;
}
