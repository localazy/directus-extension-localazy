import { storeToRefs } from 'pinia';
import {
  ExportContentFetcher,
  ExportExecutor,
  ExportOrchestratorAdapters,
  ExportProgressIds,
  UploadCursorStore,
} from './incremental-export-orchestrator';
import { CURSOR_VERSION, UploadCursor } from '@localazy/directus-common';
import { mergeUploadCursor, parseUploadCursor, serializeUploadCursor } from '@localazy/directus-common';
import { ProgressSink, SyncLogWriter } from '@localazy/directus-common';
import { useLocalazySyncStateStore } from '../stores/localazy-sync-state-store';
import { useLocalazyStore } from '../stores/localazy-store';
import { useProgressTrackerStore } from '../stores/progress-tracker-store';
import { ProgressTrackerId } from '../enums/progress-tracker-id';
import type { useDirectusLanguages } from '../composables/use-directus-languages';
import type { useTranslationStringsContent } from '../composables/use-translation-strings-content';
import type { useTranslatableCollections } from '../composables/use-translatable-collections';
import type { useCollectionsOrganizer } from '../composables/use-collections-organizer';
import type { useExportToLocalazy } from '../composables/use-export-to-localazy';

/**
 * Maps the export orchestrator's stable string progress ids to the module's
 * `ProgressTrackerId` enum values so the modal's de-dupe-by-id semantics carry over the
 * orchestrator boundary. `UPLOAD_MODE_HEADER` and `PREPARING_EXPORT` are intentionally
 * absent — those land before the orchestrator runs and are emitted directly by the
 * composable, mirroring the import orchestrator's convention (`SYNC_MODE_HEADER` /
 * `RETRIEVING_LANGUAGES` similarly stay in the composable for the import path).
 */
const PROGRESS_ID_MAP: Record<string, ProgressTrackerId> = {
  [ExportProgressIds.UPLOAD_CHANGES_SUMMARY]: ProgressTrackerId.UPLOAD_CHANGES_SUMMARY,
  [ExportProgressIds.UPLOAD_UP_TO_DATE]: ProgressTrackerId.UPLOAD_UP_TO_DATE,
  [ExportProgressIds.UPLOAD_FINISHED]: ProgressTrackerId.UPLOAD_FINISHED,
};

/**
 * Builds the `UploadCursorStore` port from the Pinia sync-state + localazy stores. The
 * merge-on-persist contract mirrors the download cursor's `buildCursorStore`: re-read the
 * latest on-disk cursor, take the in-memory cursor as truth on overlapping cells, write
 * back. Errors are swallowed so a flush failure can't take down the sync — the next flush
 * retries, and the orchestrator's final flush in `finally` is the last-resort backstop.
 */
function buildUploadCursorStore(): UploadCursorStore {
  const syncStateStore = useLocalazySyncStateStore();
  const { data: syncStateData } = storeToRefs(syncStateStore);
  const localazyStore = useLocalazyStore();
  const { localazyProject } = storeToRefs(localazyStore);

  return {
    async load() {
      return {
        cursor: parseUploadCursor(syncStateData.value.uploaded_hashes),
        projectId: syncStateData.value.cursor_project_id ?? '',
      };
    },
    async persist(inMemory: UploadCursor) {
      try {
        await syncStateStore.reload();
        const onDisk = parseUploadCursor(syncStateData.value.uploaded_hashes);
        const merged = mergeUploadCursor(onDisk, inMemory);
        await syncStateStore.save({
          uploaded_hashes: serializeUploadCursor(merged),
          cursor_project_id: localazyProject.value?.id || '',
          cursor_version: CURSOR_VERSION,
          last_sync_at: new Date().toISOString(),
        });
      } catch {
        // Swallow — error already surfaced via the errors store inside `save`. The next
        // flush retries; the orchestrator's final flush in `finally` is the backstop.
      }
    },
  };
}

/**
 * Inputs the export content fetcher closes over. Each field is the corresponding return
 * member of a Vue composable resolved at the caller's setup time — the adapter never
 * calls these composables itself, sidestepping the "useStores from a click handler"
 * crash that necessitated the same setup-time-resolution pattern on the import side.
 *
 * Types are derived via `ReturnType` so they stay in lockstep with the underlying
 * composables without redeclaration.
 */
export type ExportContentFetcherInputs = {
  resolveExportLanguages: ReturnType<typeof useDirectusLanguages>['resolveExportLanguages'];
  fetchTranslationStrings: ReturnType<typeof useTranslationStringsContent>['fetchTranslationStrings'];
  fetchContentWithHashesByCollection: ReturnType<typeof useTranslatableCollections>['fetchContentWithHashesByCollection'];
  translatableCollections: ReturnType<typeof useCollectionsOrganizer>['translatableCollections'];
};

/**
 * Wraps the three Vue composables behind the orchestrator's coalesced `ExportContentFetcher`
 * port: resolves languages, then fans out to `fetchTranslationStrings` +
 * `fetchContentWithHashesByCollection` in parallel. The orchestrator never sees the
 * resolved language list directly — nothing downstream of the fetch needs it.
 */
function buildExportContentFetcher(inputs: ExportContentFetcherInputs): ExportContentFetcher {
  return {
    async fetchExportPayload({ settings, enabledFields, synchronizeTranslationStrings }) {
      const languages = await inputs.resolveExportLanguages(settings);
      const [translationStrings, perCollectionWithHashes] = await Promise.all([
        inputs.fetchTranslationStrings({ languages, settings, synchronizeTranslationStrings }),
        inputs.fetchContentWithHashesByCollection({
          languages,
          translatableCollections: inputs.translatableCollections.value,
          enabledFields,
          settings,
        }),
      ]);
      return { translationStrings, perCollectionWithHashes };
    },
  };
}

/**
 * Wraps the `useExportToLocalazy` composable's `exportContentToLocalazy` method behind the
 * orchestrator's `ExportExecutor` port. The wrapper is near-identity — the port narrows
 * `onWritten` from optional (on the composable side) to required (the orchestrator always
 * supplies one). Function-parameter contravariance lets the assignment through.
 */
function buildExportExecutor(exportContentToLocalazy: ReturnType<typeof useExportToLocalazy>['exportContentToLocalazy']): ExportExecutor {
  return {
    async exportContentToLocalazy(input) {
      await exportContentToLocalazy(input);
    },
  };
}

/**
 * Routes orchestrator-emitted progress messages to the Pinia progress-tracker store. Same
 * `add` vs `upsert` semantics the import-side sink uses — the export orchestrator only
 * emits `add` today (no in-place updates) but the `upsert` branch stays for parity with
 * the import sink so future per-collection-progress messages don't need a sink rewrite.
 */
function buildProgressSink(): ProgressSink {
  const { addProgressMessage, upsertProgressMessage } = useProgressTrackerStore();

  return (msg) => {
    const mappedId = PROGRESS_ID_MAP[String(msg.id)];
    if (mappedId === undefined) {
      // Defensive: a future orchestrator id without a mapping skips silently rather than
      // crashing on a progress write.
      return;
    }
    const type = msg.level === 'error' ? 'error' : undefined;
    if (msg.mode === 'add') {
      addProgressMessage({ id: mappedId, message: msg.message, ...(type ? { type } : {}) });
    } else {
      upsertProgressMessage(mappedId, { message: msg.message, ...(type ? { type } : {}) });
    }
  };
}

export type BuildExportOrchestratorAdaptersInput = {
  contentFetcherInputs: ExportContentFetcherInputs;
  exportContentToLocalazy: ReturnType<typeof useExportToLocalazy>['exportContentToLocalazy'];
  /** Optional. Pair with `syncLogInitiator` to enable Sync-log session persistence. */
  syncLogWriter?: SyncLogWriter;
  syncLogInitiator?: { initiator: string; initiatorUser: string | null };
};

/**
 * Assembles the full `ExportOrchestratorAdapters` bundle. Called from the composable's
 * click handler (`onExport`) — the inputs are resolved at composable setup time and
 * threaded in here, mirroring the import-side `buildOrchestratorAdapters` pattern. The
 * Pinia-only pieces (`UploadCursorStore`, `ProgressSink`) resolve their stores inline
 * since Pinia stores are safe to read in click handlers.
 */
export function buildExportOrchestratorAdapters(input: BuildExportOrchestratorAdaptersInput): ExportOrchestratorAdapters {
  return {
    uploadCursorStore: buildUploadCursorStore(),
    contentFetcher: buildExportContentFetcher(input.contentFetcherInputs),
    exportExecutor: buildExportExecutor(input.exportContentToLocalazy),
    progress: buildProgressSink(),
    syncLogWriter: input.syncLogWriter,
    syncLogInitiator: input.syncLogInitiator,
  };
}
