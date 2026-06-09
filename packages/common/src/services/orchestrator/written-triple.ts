/**
 * One `(language, Localazy key id, event)` triple successfully applied to Directus during
 * a download sync. The orchestrator collects these from each write step and feeds them
 * back into the in-memory cursor (PATCH-then-mark — we never mark before the write
 * resolves, so a transient Directus failure can't leave us with a marked-but-not-written
 * cell that would be skipped on the next sync).
 *
 * `event` is optional because the Localazy backend may omit it for unmodified keys; the
 * cursor recording helper treats `undefined` as a no-op (`recordCursorEntry`).
 */
export type WrittenTriple = {
  language: string;
  keyId: string;
  event: number | undefined;
};
