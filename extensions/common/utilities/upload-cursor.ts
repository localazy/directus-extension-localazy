import { UploadCursor } from '../models/collections-data/sync-state';

/**
 * Pure helpers around the upload-sync cursor. The cursor is a per-(collection, itemId)
 * map storing the 16-hex-character SHA-256 hash of the canonical KV payload last
 * successfully uploaded for that item. Everything here is intentionally side-effect-free
 * — the orchestration (loading the singleton, persisting back) lives in the call site so
 * this stays testable.
 *
 * Shape: `{ [collection]: { [itemId]: hexHash16 } }`. Mirrors the download cursor's
 * (`sync-cursor.ts`) `parse/serialize/merge/filter` quartet so the call site can stay
 * symmetric.
 */

export function createEmptyUploadCursor(): UploadCursor {
  return { uploaded_hashes: {} };
}

/**
 * Parse a JSON-serialized `uploaded_hashes` blob (the on-disk format used by the
 * `localazy_sync_state` singleton). Returns an empty cursor for any malformed input —
 * the cursor is a best-effort cache, not authoritative state, so we never throw and
 * never let a corrupt row block sync. The worst case of an empty parse is "re-upload
 * everything once", which is the desired fallback.
 */
export function parseUploadCursor(raw: string | null | undefined): UploadCursor {
  if (!raw) return createEmptyUploadCursor();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return createEmptyUploadCursor();
    const uploaded: UploadCursor['uploaded_hashes'] = {};
    for (const [collection, perCollection] of Object.entries(parsed as Record<string, unknown>)) {
      if (!perCollection || typeof perCollection !== 'object') continue;
      const cleaned: Record<string, string> = {};
      for (const [itemId, hash] of Object.entries(perCollection as Record<string, unknown>)) {
        if (typeof hash === 'string' && hash.length > 0) {
          cleaned[itemId] = hash;
        }
      }
      uploaded[collection] = cleaned;
    }
    return { uploaded_hashes: uploaded };
  } catch {
    return createEmptyUploadCursor();
  }
}

export function serializeUploadCursor(cursor: UploadCursor): string {
  return JSON.stringify(cursor.uploaded_hashes);
}

/**
 * Record one successfully-uploaded `(collection, itemId, hash)` triple in the in-memory
 * cursor. Mutates `cursor` for performance — sync writes happen in a hot loop. Overwrites
 * any prior hash for the same cell (the new hash, by definition, reflects what we just
 * pushed).
 */
export function recordUploadEntry(cursor: UploadCursor, collection: string, itemId: string, hash: string): void {
  if (!hash) return;
  const bucket = cursor.uploaded_hashes[collection] || (cursor.uploaded_hashes[collection] = {});
  bucket[itemId] = hash;
}

/**
 * Merge two cursors cell-by-cell, taking the right-hand value when both sides have an
 * entry. The use case (persisting after a sync) treats `b` (the in-memory cursor from
 * this run) as the source of truth — `a` is whatever was on disk before we started, and
 * if both sides claim a hash for the same cell, the just-completed run wins. Pure —
 * neither input is mutated, the result is a fresh object.
 */
export function mergeUploadCursor(a: UploadCursor, b: UploadCursor): UploadCursor {
  const result: UploadCursor['uploaded_hashes'] = {};
  const allCollections = new Set([...Object.keys(a.uploaded_hashes), ...Object.keys(b.uploaded_hashes)]);
  for (const collection of allCollections) {
    const left = a.uploaded_hashes[collection] || {};
    const right = b.uploaded_hashes[collection] || {};
    const allItems = new Set([...Object.keys(left), ...Object.keys(right)]);
    const merged: Record<string, string> = {};
    for (const itemId of allItems) {
      const rv = right[itemId];
      const lv = left[itemId];
      // Right-hand wins when present; otherwise keep the left-hand entry.
      merged[itemId] = rv !== undefined ? rv : lv!;
    }
    result[collection] = merged;
  }
  return { uploaded_hashes: result };
}

/**
 * Filter a list of `(itemId, currentHash)` pairs down to those that need (re-)uploading
 * according to the cursor. An item is included iff its current hash differs from the
 * stored hash for the same `(collection, itemId)` cell — i.e. something about its
 * upload payload has changed since the last successful push.
 *
 * If the cursor doesn't have an entry for this `(collection, itemId)`, the item is
 * included (first-time export, or a previously-skipped item now needing push).
 */
export function filterItemsByUploadCursor<T extends { id: string | number; hash: string }>(
  collection: string,
  items: T[],
  cursor: UploadCursor,
): T[] {
  const bucket = cursor.uploaded_hashes[collection];
  if (!bucket) return items;
  return items.filter((it) => {
    const stored = bucket[String(it.id)];
    if (stored === undefined) return true;
    return stored !== it.hash;
  });
}

/**
 * Count the total cells in a cursor (sum of per-collection map sizes). Useful for
 * debugging / progress reporting, not for correctness.
 */
export function countUploadCursorEntries(cursor: UploadCursor): number {
  let total = 0;
  for (const perCollection of Object.values(cursor.uploaded_hashes)) {
    total += Object.keys(perCollection).length;
  }
  return total;
}

/**
 * Canonicalize an arbitrary JSON-compatible value into a stable string form suitable for
 * hashing.
 *
 * Invariants:
 *   - Object keys are deep-sorted (recursive) so `{ a, b }` and `{ b, a }` hash equal.
 *   - `undefined` is treated as absent (omitted from both top-level and nested objects),
 *     matching the design's "what would actually go on the wire" semantics — Localazy
 *     never sees `undefined`, so two payloads differing only by an undefined field are
 *     identical.
 *   - `null` is preserved verbatim (semantically distinct from absent).
 *   - Empty strings are preserved verbatim.
 *   - Whitespace is preserved (no trimming) — Localazy sees what we send.
 *   - Numbers use `JSON.stringify` defaults (NaN/Infinity → `null`, but we don't expect
 *     those in real upload payloads). Booleans, strings: native `JSON.stringify`.
 *   - Arrays: positional, NOT sorted (order is part of identity).
 */
export function canonicalizeForHash(value: unknown): string {
  return JSON.stringify(canonicalizeValue(value));
}

function canonicalizeValue(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) {
    return value.map((v) => (v === undefined ? null : canonicalizeValue(v)));
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const sorted: Record<string, unknown> = {};
    for (const [k, v] of entries) {
      sorted[k] = canonicalizeValue(v);
    }
    return sorted;
  }
  return value;
}

/**
 * Compute the 16-hex-character truncated SHA-256 hash of an arbitrary JSON-compatible
 * value. Uses Web Crypto's `crypto.subtle.digest('SHA-256', ...)`, which is available in
 * both browser (module) and Node 22 (sync-hook + test) runtimes.
 *
 * 16 hex chars = 64 bits of collision space. At expected scales (tens of thousands of
 * items per install), this is well below the birthday-paradox threshold and adequate for
 * a cache-busting cursor where the cost of a collision is "we skipped an item that
 * actually changed" — which the next manual Full Upload trivially resolves.
 */
export async function computeItemHash(value: unknown): Promise<string> {
  const canonical = canonicalizeForHash(value);
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const view = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < 8; i += 1) {
    hex += view[i]!.toString(16).padStart(2, '0');
  }
  return hex;
}
