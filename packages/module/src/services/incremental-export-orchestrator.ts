import { merge } from 'lodash';
import { Project } from '@localazy/api-client';
import { Settings } from '@localazy/directus-common';
import { EnabledField } from '@localazy/directus-common';
import { TranslatableContent } from '@localazy/directus-common';
import { UploadCursor } from '@localazy/directus-common';
import { cursorMatchesProject } from '@localazy/directus-common';
import { createEmptyUploadCursor, filterItemsByUploadCursor, recordUploadEntry } from '@localazy/directus-common';
import { formatLanguageOption } from '@localazy/directus-common';
import { ProgressSink, SyncLogWriter } from '@localazy/directus-common';
import { LogHandle, makeLogHandle, makeNoopLogHandle } from '@localazy/directus-common';
import { UploadTrackedItem } from '../composables/use-export-to-localazy';
import { UploadedTriple } from '../models/upload-write-result';
import { summarizeUploadContent, UploadContentSummary } from '../utils/summarize-upload-content';

export type SyncMode = 'incremental' | 'full';

/**
 * Terminal-status union for an export run. Narrower than the SyncLog row's free-string
 * column on purpose: the export pipeline only produces these three values today and the
 * Activity page's `<status-label>` only knows how to colour them. Status precedence: an
 * explicit `skipped` from the empty short-circuit wins; otherwise an unhandled throw
 * flips to `failed`; otherwise the default `completed` stands.
 */
export type ExportStatus = 'completed' | 'failed' | 'skipped';

/**
 * Stable progress-message ids the orchestrator emits during a run. The module's
 * `ProgressSink` adapter maps these to `ProgressTrackerId` enum values so the modal's
 * de-dupe-by-id semantics carry over.
 *
 * The `UPLOAD_MODE_HEADER` ("Full upload — ..." / "Incremental upload") and the
 * `PREPARING_EXPORT` ("Preparing items for upload...") lines are intentionally NOT emitted
 * by the orchestrator — they happen before the orchestrator runs, while the caller is
 * setting up. The caller (composable today, future server-side trigger) is responsible
 * for emitting them. This mirrors the import orchestrator's contract.
 */
export const ExportProgressIds = {
  UPLOAD_CHANGES_SUMMARY: 'upload-changes-summary' as const,
  UPLOAD_UP_TO_DATE: 'upload-up-to-date' as const,
  UPLOAD_FINISHED: 'upload-finished' as const,
};

/**
 * Cursor I/O port for the upload pipeline. Mirrors `CursorStore` in `common/orchestrator/ports`
 * (the download cursor's port) — same load/persist shape, same merge-on-persist contract.
 * `persist` is expected to re-read the latest on-disk cursor, take cell-wise precedence
 * for the in-memory cursor (since the in-memory hash reflects what was *just* pushed),
 * and write the result. Errors are swallowed inside the adapter — a flush failure shouldn't
 * take down the sync; the next flush retries; the final flush in `finally` is the backstop.
 */
export interface UploadCursorStore {
  /** Returns the latest on-disk upload cursor and the project id it was written against. */
  load(): Promise<{ cursor: UploadCursor; projectId: string }>;
  /** Persists the in-memory cursor. Implementation handles merge-on-persist. */
  persist(cursor: UploadCursor): Promise<void>;
}

/**
 * Coalesced fetch port. One method returns everything the orchestrator needs to assemble
 * the export payload: per-collection content with hashes, and translation-strings content.
 * Language resolution happens inside the adapter — the orchestrator never sees the
 * resolved language list directly because nothing downstream of the fetch needs it.
 *
 * Hiding three Vue-bound composables (`useDirectusLanguages`, `useTranslationStringsContent`,
 * `useTranslatableCollections`) behind one port keeps the orchestrator free of Vue
 * dependencies and the parallel `Promise.all` an implementation detail.
 */
export interface ExportContentFetcher {
  fetchExportPayload(input: { settings: Settings; enabledFields: EnabledField[]; synchronizeTranslationStrings: boolean }): Promise<{
    translationStrings: TranslatableContent;
    perCollectionWithHashes: Array<{
      collection: string;
      items: Array<{ id: string | number; content: TranslatableContent; hash: string }>;
    }>;
  }>;
}

/**
 * The push port. Encapsulates the chunk/throttle/upload pipeline that today lives in
 * `useExportToLocalazy`. The orchestrator owns the `onWritten` callback that records
 * successful uploads into the in-memory cursor; the executor is expected to fire it
 * after every chunk an item contributed to resolves successfully.
 */
export interface ExportExecutor {
  exportContentToLocalazy(input: {
    content: TranslatableContent;
    settings: Settings;
    trackedItems: Map<string, UploadTrackedItem[]>;
    onWritten: (uploads: UploadedTriple[]) => void;
  }): Promise<void>;
}

export type ExportOrchestratorAdapters = {
  uploadCursorStore: UploadCursorStore;
  contentFetcher: ExportContentFetcher;
  exportExecutor: ExportExecutor;
  progress: ProgressSink;
  /**
   * Optional persistent log writer. When supplied, the orchestrator opens a session right
   * before the body runs and finalises it in `finally` — including the failure path,
   * where the session is closed with `status: 'failed'` before the error propagates.
   * Required to be paired with `syncLogInitiator`.
   */
  syncLogWriter?: SyncLogWriter;
  syncLogInitiator?: { initiator: string; initiatorUser: string | null };
};

export type IncrementalExportParams = {
  mode: SyncMode;
  settings: Settings;
  enabledFields: EnabledField[];
  synchronizeTranslationStrings: boolean;
  localazyProject: Project;
  /**
   * Display name of the source language, sourced from the user's Directus languages
   * collection (e.g. "English" when `settings.source_language` is `"en"`). Surfaced in
   * the changes-summary log line as "Name (code)" via `formatLanguageOption`. Optional —
   * when null/undefined the message falls back to the bare code.
   */
  sourceLanguageName?: string | null;
};

export type IncrementalExportResult = {
  status: ExportStatus;
  itemsProcessed: number;
  durationMs: number;
  /** Human-readable terminal summary string; mirrors what the progress modal showed. */
  summary: string;
};

/** Mirrors the persisted column's free-string contract for the export side. */
function eventTypeForMode(mode: SyncMode): string {
  return mode === 'full' ? 'upload-full' : 'upload-incremental';
}

/**
 * Build the "Found N changed items..." headline emitted to both the progress modal and
 * the sync-log entry. Names the source language inline (e.g. "in en") so the reader
 * can match the figures against what they see on the Localazy dashboard without having
 * to remember which language is the project source.
 *
 * When some leaf strings are empty (or whitespace-only), Localazy's `import.json` drops
 * them server-side, so the non-empty subcount is the figure that ultimately materialises
 * as keys in the project. We surface it inline only when it differs from the total —
 * keeps the line tight for the common all-non-empty case.
 *
 * The "+ N translation entries" suffix is omitted entirely when `translationEntries`
 * is zero. The user-visible setting toggles whether translations ship at all, so when
 * that's off the suffix would always read "+ 0 translation entries" — noise that
 * obscures the source-lang numbers the reader actually cares about.
 */
function formatChangesSummaryMessage(summary: UploadContentSummary, sourceLanguageCode: string, sourceLanguageName: string | null): string {
  const sourceLabel = sourceLanguageCode ? formatLanguageOption(sourceLanguageCode, sourceLanguageName) : 'source language';
  const sourcePart =
    summary.nonEmptySourceLangEntries === summary.sourceLangEntries
      ? `${summary.sourceLangEntries} entries in ${sourceLabel}`
      : `${summary.sourceLangEntries} entries in ${sourceLabel} (${summary.nonEmptySourceLangEntries} non-empty)`;
  const translationPart =
    summary.translationEntries === 0
      ? ''
      : summary.nonEmptyTranslationEntries === summary.translationEntries
        ? ` + ${summary.translationEntries} translation entries`
        : ` + ${summary.translationEntries} translation entries (${summary.nonEmptyTranslationEntries} non-empty)`;
  return `Found ${summary.items} changed ${summary.items === 1 ? 'item' : 'items'} across ${summary.collections} ${summary.collections === 1 ? 'collection' : 'collections'} — pushing ${sourcePart}${translationPart}`;
}

/**
 * Drives a user-triggered export run end-to-end:
 *   1. Opens an (optional) Sync-log session.
 *   2. Loads + auto-invalidates the on-disk upload cursor against the current project.
 *   3. Fetches translation strings + per-collection content with hashes.
 *   4. Filters items via the cursor (incremental) or treats the cursor as empty (full).
 *   5. Short-circuits if there's nothing changed and no translation strings to refresh.
 *   6. Pushes via the executor with a throttled in-memory cursor flush every 50 items
 *      (or 10% of total work, whichever's larger).
 *   7. Final cursor flush in `finally` so the last batch lands even if the body throws.
 *   8. Finalises the Sync-log session with the terminal status.
 *
 * Throws on unhandled errors after persisting the in-memory cursor and finalising the
 * log session — the caller's `catch` sees the original error.
 *
 * No advisory lock today — export is user-click-only. If two users click Export
 * concurrently, both runs proceed; the cursor's merge-on-persist makes that benign.
 *
 * Milestone logging mirrors the import side: started, up-to-date, changes summary,
 * per-collection counts (after the upload step settles), translation-strings count when
 * non-zero, terminal completion line, and failure entries. The handle is a no-op when
 * no `syncLogWriter` was wired so the orchestrator's body stays free of conditional
 * checks at every milestone.
 */
export async function runIncrementalExport(
  adapters: ExportOrchestratorAdapters,
  params: IncrementalExportParams,
): Promise<IncrementalExportResult> {
  const { uploadCursorStore, contentFetcher, exportExecutor, progress, syncLogWriter, syncLogInitiator } = adapters;
  const { mode, settings, enabledFields, synchronizeTranslationStrings, localazyProject, sourceLanguageName } = params;

  const startedAt = Date.now();

  // Best-effort session start. A failure here falls back to no logging for this run —
  // the export itself still proceeds. The `finalise` step below is gated on `sessionId !== null`.
  let sessionId: string | null = null;
  let log: LogHandle = makeNoopLogHandle();
  if (syncLogWriter && syncLogInitiator) {
    try {
      sessionId = await syncLogWriter.startSession({
        eventType: eventTypeForMode(mode),
        initiator: syncLogInitiator.initiator,
        initiatorUser: syncLogInitiator.initiatorUser,
      });
      log = makeLogHandle(syncLogWriter, sessionId);
    } catch {
      // Swallow — the Activity page just won't show this run.
    }
  }

  // Milestone log: "started" line. Mirrors the download side's first entry so the
  // Activity reader sees a consistent opener regardless of direction. The line is
  // intentionally light on numbers — counts aren't known until after the fetch.
  log.appendInfo(`${mode === 'full' ? 'Full' : 'Incremental'} upload started`);

  // Mutated inside the body and the various exit paths; declared here so `finally` reads
  // them when finalising the Sync-log session. Every reachable path assigns `logStatus`
  // and `logSummary` before the `finally` runs, so the initial values are placeholders
  // the linter would otherwise flag — `completed` matches the happy path, the empty
  // summary is overwritten on every exit (skipped, failed, or completed paths all
  // re-assign it before the return / throw).
  let writtenSinceStart = 0;
  let logStatus: ExportStatus = 'completed';
  // eslint-disable-next-line no-useless-assignment
  let logSummary = '';

  try {
    // Load + auto-invalidate the on-disk upload cursor.
    //   - Incremental: use the on-disk cursor unless the project id changed (fresh
    //     project = fresh cursor).
    //   - Full: start empty. We don't wipe the persisted cursor here — merge-on-persist
    //     preserves untouched cells.
    const { cursor: storedCursor, projectId: storedProjectId } = await uploadCursorStore.load();
    const baseUploadCursor: UploadCursor =
      mode === 'full' || !cursorMatchesProject(storedProjectId, localazyProject.id || '') ? createEmptyUploadCursor() : storedCursor;
    // Tracks only what we successfully pushed in this run. Merged with on-disk on flush.
    const inMemoryUploadCursor: UploadCursor = createEmptyUploadCursor();

    const { translationStrings, perCollectionWithHashes } = await contentFetcher.fetchExportPayload({
      settings,
      enabledFields,
      synchronizeTranslationStrings,
    });

    // Filter each collection's items against the upload cursor. Translation strings bypass
    // cursor logic entirely — they always full re-push.
    const trackedItems = new Map<string, UploadTrackedItem[]>();
    const collectionsContent: TranslatableContent = { sourceLanguage: {}, otherLanguages: {} };

    perCollectionWithHashes.forEach(({ collection, items }) => {
      const filteredItems = filterItemsByUploadCursor(collection, items, baseUploadCursor);
      if (filteredItems.length === 0) return;
      trackedItems.set(
        collection,
        filteredItems.map((it) => ({ id: it.id, hash: it.hash })),
      );
      filteredItems.forEach((it) => {
        merge(collectionsContent, it.content);
      });
    });

    const mergedContent: TranslatableContent = merge(collectionsContent, translationStrings);
    const summary = summarizeUploadContent(mergedContent);

    let totalTrackedItems = 0;
    trackedItems.forEach((items) => {
      totalTrackedItems += items.length;
    });

    // Short-circuit when there's nothing to push AND no translation strings to refresh.
    if (totalTrackedItems === 0 && summary.sourceLangEntries === 0 && summary.translationEntries === 0) {
      const upToDateMessage = 'Already up to date — no items have changed since the last upload';
      progress({
        id: ExportProgressIds.UPLOAD_UP_TO_DATE,
        message: upToDateMessage,
      });
      log.appendInfo(upToDateMessage);
      // Touch last_sync_at via merge-on-persist; on-disk cursor is preserved.
      await uploadCursorStore.persist(inMemoryUploadCursor);
      logStatus = 'skipped';
      logSummary = upToDateMessage;
      return {
        status: 'skipped',
        itemsProcessed: 0,
        durationMs: Date.now() - startedAt,
        summary: logSummary,
      };
    }

    const changesSummaryMessage = formatChangesSummaryMessage(summary, settings.source_language, sourceLanguageName ?? null);
    progress({
      id: ExportProgressIds.UPLOAD_CHANGES_SUMMARY,
      message: changesSummaryMessage,
    });
    log.appendInfo(changesSummaryMessage);

    // Throttled flush: persist every `flushEvery` items completed (capped at 10% of total
    // work, minimum 50). Final flush below is unconditional.
    const flushEvery = Math.max(50, Math.ceil(totalTrackedItems / 10));
    let sinceLastFlush = 0;
    // Per-collection sets of uploaded item ids. We use a Set so callbacks that fire
    // multiple times for the same (collection, itemId) — e.g. once per language chunk —
    // are deduped before we emit the per-collection log entry. Mirrors how the
    // changes-summary line counts items.
    const uploadedItemsByCollection = new Map<string, Set<string>>();

    const onWritten = (uploads: UploadedTriple[]) => {
      uploads.forEach((u) => {
        recordUploadEntry(inMemoryUploadCursor, u.collection, u.itemId, u.hash);
        let set = uploadedItemsByCollection.get(u.collection);
        if (!set) {
          set = new Set<string>();
          uploadedItemsByCollection.set(u.collection, set);
        }
        set.add(u.itemId);
      });
      sinceLastFlush += uploads.length;
      writtenSinceStart += uploads.length;
      if (sinceLastFlush >= flushEvery) {
        sinceLastFlush = 0;
        // Fire-and-forget: the next persist re-reads disk anyway, and we don't want
        // upload progress to stall on a slow Directus PATCH.
        void uploadCursorStore.persist(inMemoryUploadCursor);
      }
    };

    // Final flush — guarantees the last batch lands even if it didn't cross the throttle
    // threshold. The `finally` makes the contract literal.
    try {
      await exportExecutor.exportContentToLocalazy({
        content: mergedContent,
        settings,
        trackedItems,
        onWritten,
      });
    } finally {
      await uploadCursorStore.persist(inMemoryUploadCursor);
    }

    // Milestone log: per-collection counts. Emitted after the upload step so the numbers
    // reflect items that actually landed (counted via `onWritten`). Translation strings
    // bypass the cursor entirely and aren't reflected in `uploadedItemsByCollection`;
    // they get their own line below derived from the pre-flight summary.
    uploadedItemsByCollection.forEach((items, collectionName) => {
      log.appendInfo(`${collectionName}: ${items.size} ${items.size === 1 ? 'item' : 'items'} uploaded`);
    });
    if (summary.translationEntries > 0) {
      log.appendInfo(
        `Translation strings: ${summary.translationEntries} ${summary.translationEntries === 1 ? 'entry' : 'entries'} uploaded`,
      );
    }

    const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
    // `writtenSinceStart` counts only collection-content items confirmed via the cursor —
    // translation strings always full re-push and aren't tracked. When only translation
    // strings flowed through, the counter stays at 0 even though work happened; the
    // generic "Upload completed" line reflects that case honestly.
    const finalMessage =
      writtenSinceStart > 0
        ? `Uploaded ${writtenSinceStart} ${writtenSinceStart === 1 ? 'item' : 'items'} in ${elapsedSec}s.`
        : `Upload completed in ${elapsedSec}s.`;
    progress({
      id: ExportProgressIds.UPLOAD_FINISHED,
      message: finalMessage,
    });
    log.appendInfo(finalMessage);
    logSummary = finalMessage;

    return {
      status: 'completed',
      itemsProcessed: writtenSinceStart,
      durationMs: Date.now() - startedAt,
      summary: finalMessage,
    };
  } catch (err) {
    logStatus = 'failed';
    const failureMessage = `Upload failed: ${err instanceof Error ? err.message : String(err)}`;
    log.appendError(failureMessage);
    logSummary = failureMessage;
    throw err;
  } finally {
    // Finalise the sync-log row even on throw. Swallow finalisation errors — a
    // left-in-progress row is fine for the Activity page; the next run's trim cleans it
    // up. The user-facing outcome is already on the progress modal, not the log row.
    if (syncLogWriter && sessionId) {
      try {
        await syncLogWriter.finish(sessionId, {
          status: logStatus,
          summary: logSummary,
          itemsProcessed: writtenSinceStart,
        });
      } catch {
        // Swallow.
      }
    }
  }
}
