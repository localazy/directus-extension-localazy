import { Key } from '@localazy/api-client';
import { SyncCursor } from '../models/collections-data/sync-state';

/**
 * Pure helpers around the download-sync cursor. The cursor is a per-(language, key id)
 * map storing the last `event` number we successfully wrote for that cell. Everything
 * here is intentionally side-effect-free and synchronous — the orchestration (loading
 * the singleton, persisting back) lives in the call site so this stays testable.
 *
 * The shape mirrors the Strapi-plugin implementation: `{ [lang]: { [keyId]: event } }`.
 */

export function createEmptyCursor(): SyncCursor {
  return { processed_keys: {} };
}

/**
 * Parse a JSON-serialized `processed_keys` blob (the on-disk format used by the
 * `localazy_sync_state` singleton). Returns an empty cursor for any malformed input —
 * the cursor is best-effort cache, not authoritative state, so we never throw and
 * never let a corrupt row block sync. The worst case of an empty parse is "re-download
 * everything once", which is the desired fallback.
 */
export function parseCursor(raw: string | null | undefined): SyncCursor {
  if (!raw) return createEmptyCursor();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return createEmptyCursor();
    const processed: SyncCursor['processed_keys'] = {};
    for (const [lang, perLang] of Object.entries(parsed as Record<string, unknown>)) {
      if (!perLang || typeof perLang !== 'object') continue;
      const cleaned: Record<string, number> = {};
      for (const [keyId, event] of Object.entries(perLang as Record<string, unknown>)) {
        if (typeof event === 'number' && Number.isFinite(event)) {
          cleaned[keyId] = event;
        }
      }
      processed[lang] = cleaned;
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
 * about to sync. Used at sync start to decide whether to treat the on-disk cursor as
 * authoritative or wipe it in memory. Empty `storedProjectId` is treated as "no recorded
 * project" — i.e. first sync — so the cursor is acceptable.
 */
export function cursorMatchesProject(storedProjectId: string, currentProjectId: string): boolean {
  if (!storedProjectId) return true;
  return storedProjectId === currentProjectId;
}

/**
 * Filter keys for a single language down to those that need (re-)downloading according
 * to the cursor.
 *
 * Rule (must match the Strapi plugin exactly):
 *   - If we have no cursor entry for `(lang, key.id)` → include.
 *   - If the server didn't return an `event` for the key → include (safe mode).
 *   - Otherwise include iff `key.event > storedEvent`.
 *
 * The "include on undefined" rules protect us against either side of the sync getting
 * confused: if Localazy ever rolls out a backend that doesn't echo `event`, we degrade to
 * "always download" rather than "always skip".
 */
export function filterKeysByEventCursor(keys: Key[], perLanguageCursor: Record<string, number> | undefined): Key[] {
  if (!perLanguageCursor) return keys;
  return keys.filter((k) => {
    const stored = perLanguageCursor[k.id];
    if (stored === undefined) return true;
    if (k.event === undefined) return true;
    return k.event > stored;
  });
}

/**
 * Record one successfully-applied `(lang, keyId, event)` triple in the in-memory cursor.
 * Mutates `cursor` for performance — sync writes happen in a hot loop. If the cell
 * already holds a higher event (rare, but possible if a concurrent sync raced ahead),
 * keep the higher value.
 */
export function recordCursorEntry(cursor: SyncCursor, lang: string, keyId: string, event: number | undefined): void {
  if (event === undefined) return;
  const bucket = cursor.processed_keys[lang] || (cursor.processed_keys[lang] = {});
  const existing = bucket[keyId];
  bucket[keyId] = existing === undefined ? event : Math.max(existing, event);
}

/**
 * Merge two cursors cell-by-cell, taking `max(event)` per `(lang, keyId)`. Used when
 * persisting the in-memory cursor: we re-read the on-disk cursor, merge so we don't
 * clobber concurrent writers, and write the result back. Pure — neither input is
 * mutated, the result is a fresh object.
 */
export function mergeCursor(a: SyncCursor, b: SyncCursor): SyncCursor {
  const result: SyncCursor['processed_keys'] = {};
  const allLangs = new Set([...Object.keys(a.processed_keys), ...Object.keys(b.processed_keys)]);
  for (const lang of allLangs) {
    const left = a.processed_keys[lang] || {};
    const right = b.processed_keys[lang] || {};
    const allKeys = new Set([...Object.keys(left), ...Object.keys(right)]);
    const merged: Record<string, number> = {};
    for (const keyId of allKeys) {
      const lv = left[keyId];
      const rv = right[keyId];
      if (lv === undefined) {
        merged[keyId] = rv!;
      } else if (rv === undefined) {
        merged[keyId] = lv;
      } else {
        merged[keyId] = Math.max(lv, rv);
      }
    }
    result[lang] = merged;
  }
  return { processed_keys: result };
}

/**
 * Count the total cells in a cursor (sum of per-language map sizes). Useful for
 * debugging / progress reporting, not for correctness.
 */
export function countCursorEntries(cursor: SyncCursor): number {
  let total = 0;
  for (const perLang of Object.values(cursor.processed_keys)) {
    total += Object.keys(perLang).length;
  }
  return total;
}
