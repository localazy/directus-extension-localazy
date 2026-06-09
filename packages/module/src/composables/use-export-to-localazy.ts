import { storeToRefs } from 'pinia';
import { Ref, ref } from 'vue';
import { ProgressTrackerId } from '../enums/progress-tracker-id';
import { Settings } from '@localazy/directus-common';
import { KeyValueEntry } from '@localazy/directus-common';
import { TranslatableContent } from '@localazy/directus-common';
import { AnalyticsService } from '@localazy/directus-common';
import { ContentFromCollections } from '@localazy/directus-common';
import { createAsyncQueue } from '@localazy/directus-common';
import { useProgressTrackerStore } from '../stores/progress-tracker-store';
import { useLocalazyStore } from '../stores/localazy-store';
import { useErrorsStore } from '../stores/errors-store';
import { ExportToLocalazyCommonService } from '@localazy/directus-common';
import { UploadedTriple } from '../models/upload-write-result';

/**
 * Per-collection list of upload-tracked items. The orchestrator passes only the items it
 * wants written back to the upload cursor; translation strings are intentionally absent
 * (decision 2: always full re-push, never cursor-tracked).
 */
export type UploadTrackedItem = { id: string | number; hash: string };

type ExportContentToLocalazy = {
  content: TranslatableContent;
  settings: Settings;
  /**
   * Items the caller wants reported back via `onWritten` after all containing chunks
   * resolve successfully. Keyed by collection. The cursor write step happens here so the
   * caller doesn't have to replicate the chunk-splitting math.
   */
  trackedItems?: Map<string, UploadTrackedItem[]>;
  /**
   * Invoked once per item, after every chunk that item contributed to has resolved
   * successfully. Per-item-after-all-chunks-succeed: a partial upload (some languages
   * succeeded, others failed) must NOT advance the cursor.
   */
  onWritten?: (uploads: UploadedTriple[]) => void;
};

/**
 * Returns the non-meta top-level keys of a chunk in deterministic order. Mirrors the
 * filter `splitContentIntoChunks` applies; used to figure out which `(collection, item)`
 * pairs belong to which chunk so the orchestrator can mark items only after all their
 * chunks succeed.
 */
function nonMetaTopLevelKeys(chunk: KeyValueEntry): string[] {
  return Object.keys(chunk).filter((k) => !k.startsWith('@meta:'));
}

export const useExportToLocalazy = (token: Ref<string>) => {
  const loading = ref(false);
  const { execute, add } = createAsyncQueue();
  const { addProgressMessage, upsertProgressMessage } = useProgressTrackerStore();
  const { addLocalazyError } = useErrorsStore();
  const { localazyProject, projectId, localazyUser } = storeToRefs(useLocalazyStore());

  /**
   * Build the export task list for one language. Returns the queued tasks plus a list of
   * `(chunkId, topLevelKeys)` pairs so the orchestrator can compute per-item chunk
   * membership before the queue executes.
   */
  const createExportTasksForLanguage = (
    content: KeyValueEntry,
    language: string,
    chunkSuccesses: Set<string>,
  ): {
    tasks: Array<() => Promise<void>>;
    chunkAssignments: Array<{ chunkId: string; topLevelKeys: string[] }>;
  } => {
    const contentChunks = ContentFromCollections.splitContentIntoChunks(content);
    const chunkAssignments = contentChunks.map((chunk, index) => ({
      chunkId: `${language}:${index}`,
      topLevelKeys: nonMetaTopLevelKeys(chunk),
    }));

    const tasks = contentChunks.map((chunk, index) => async () => {
      const chunkId = `${language}:${index}`;
      addProgressMessage({
        id: ProgressTrackerId.IMPORTED_CONTENT_CHUNK,
        message: `(${language}) Exporting ${index + 1} / ${contentChunks.length} content chunks`,
      });

      return ExportToLocalazyCommonService.exportToLocalazy(token.value, projectId.value, chunk, language)
        .then(() => {
          chunkSuccesses.add(chunkId);
          upsertProgressMessage(ProgressTrackerId.IMPORTED_CONTENT_CHUNK, {
            message: `(${language}) Export ${index + 1} / ${contentChunks.length} content chunks`,
          });
        })
        .catch((e: unknown) => {
          addLocalazyError(e, { type: 'export', userId: localazyUser.value.id, orgId: localazyProject.value?.orgId || '' });
        });
    });

    return { tasks, chunkAssignments };
  };

  const exportContentToLocalazy = async (data: ExportContentToLocalazy) => {
    const { content, settings, trackedItems, onWritten } = data;
    loading.value = true;

    const directusSourceLanguageAsLocalazyLanguage = ExportToLocalazyCommonService.getDirectusSourceLanguageAsLocalazyLanguage({
      localazySourceLanguage: localazyProject.value?.sourceLanguage || 0,
      directusSourceLanguage: settings.source_language,
    });

    // Chunk-level success tracking. Items report success only after every chunk they
    // contributed to has landed in this set.
    const chunkSuccesses = new Set<string>();
    // Per-(collection, itemId) chunk membership. An item's translations may land in
    // multiple chunks (different languages, or — pathologically — different chunk slots
    // when collection count exceeds CHUNK_LIMIT).
    const chunkMembership = new Map<string /* collection.itemId */, Set<string /* chunkId */>>();

    function recordChunkAssignment(chunkId: string, topLevelKeys: string[]) {
      if (!trackedItems) return;
      topLevelKeys.forEach((collectionName) => {
        const items = trackedItems.get(collectionName);
        if (!items) return;
        items.forEach((item) => {
          const cellKey = `${collectionName}.${String(item.id)}`;
          const set = chunkMembership.get(cellKey) || new Set<string>();
          set.add(chunkId);
          chunkMembership.set(cellKey, set);
        });
      });
    }

    const sourceLangPlan = createExportTasksForLanguage(content.sourceLanguage, directusSourceLanguageAsLocalazyLanguage, chunkSuccesses);
    sourceLangPlan.chunkAssignments.forEach(({ chunkId, topLevelKeys }) => recordChunkAssignment(chunkId, topLevelKeys));
    add(sourceLangPlan.tasks);

    Object.entries(content.otherLanguages).forEach(([language, languageContent]) => {
      const plan = createExportTasksForLanguage(languageContent, language, chunkSuccesses);
      plan.chunkAssignments.forEach(({ chunkId, topLevelKeys }) => recordChunkAssignment(chunkId, topLevelKeys));
      add(plan.tasks);
    });

    if (localazyProject.value) {
      addProgressMessage({
        id: ProgressTrackerId.LOADED_LOCALAZY_PROJECT,
        message: `Loaded project ${localazyProject.value.name}`,
      });

      await execute({ delayBetween: 150 });

      // After all chunks resolve, fire onWritten for every tracked item whose membership
      // is a subset of `chunkSuccesses`. Items that didn't end up in any chunk (e.g. they
      // assembled to empty content) have an empty membership set, and ∅ ⊆ any set —
      // they're correctly reported as written (the empty hash is recorded so subsequent
      // syncs skip them too).
      if (trackedItems && onWritten) {
        const uploads: UploadedTriple[] = [];
        trackedItems.forEach((items, collection) => {
          items.forEach((item) => {
            const cellKey = `${collection}.${String(item.id)}`;
            const membership = chunkMembership.get(cellKey) || new Set<string>();
            let allSucceeded = true;
            membership.forEach((chunkId) => {
              if (!chunkSuccesses.has(chunkId)) allSucceeded = false;
            });
            if (allSucceeded) {
              uploads.push({ collection, itemId: String(item.id), hash: item.hash });
            }
          });
        });
        if (uploads.length > 0) {
          onWritten(uploads);
        }
      }

      loading.value = false;
      // The orchestrator (`onExport`) owns the final summary message — including the
      // empty-content short-circuit ("Already up to date — no items have changed…") and
      // the populated summary ("Uploaded N items in T.Ts."). Adding `EXPORT_FINISHED`
      // here too would render a duplicate row in the progress modal.
      // Analytics is fire-and-forget; export completion shouldn't block on telemetry.
      void AnalyticsService.trackUploadToLocalazy(
        ExportToLocalazyCommonService.getPayloadForUploadAnalytics({
          userId: localazyUser.value.id,
          orgId: localazyProject.value.orgId || '',
          localazyProject: localazyProject.value.name || '',
          settings,
          languages: Object.keys(content.otherLanguages),
        }),
      );
    } else {
      addProgressMessage({
        id: ProgressTrackerId.NOT_CONNECTED_TO_LOCALAZY,
        type: 'error',
        message: "Couldn't connect to Localazy",
      });
    }
  };

  return {
    exportContentToLocalazy,
    loading,
  };
};
