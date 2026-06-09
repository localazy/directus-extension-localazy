import { describe, expect, it, vi } from 'vitest';
import type { Project } from '@localazy/api-client';
import {
  ExportContentFetcher,
  ExportExecutor,
  ExportOrchestratorAdapters,
  ExportProgressIds,
  IncrementalExportParams,
  runIncrementalExport,
  UploadCursorStore,
} from './incremental-export-orchestrator';
import type { Settings } from '@localazy/directus-common';
import type { TranslatableContent } from '@localazy/directus-common';
import { UploadCursor } from '@localazy/directus-common';
import { createEmptyUploadCursor } from '@localazy/directus-common';
import type { UploadedTriple } from '../models/upload-write-result';
import type { ProgressSink, SyncLogWriter } from '@localazy/directus-common';

/* -------------------------------------------------------------------------- */
/*  Fixtures + fakes                                                          */
/* -------------------------------------------------------------------------- */

function emptySettings(): Settings {
  // The orchestrator threads settings through to the fetcher + executor; the only field
  // it reads directly is `source_language`, which feeds the changes-summary headline.
  // Default to 'en' so message assertions can match an actual language code.
  return { source_language: 'en' } as Settings;
}

function fakeProject(id = 'proj-1'): Project {
  return { id, orgId: 'org-1' } as Project;
}

function makeProgressFake(): { sink: ProgressSink; emitted: Array<{ id: string; message: string }> } {
  const emitted: Array<{ id: string; message: string }> = [];
  const sink: ProgressSink = (msg) => {
    emitted.push({ id: String(msg.id), message: msg.message });
  };
  return { sink, emitted };
}

type CursorStoreFake = {
  store: UploadCursorStore;
  persisted: UploadCursor[];
};

function makeCursorStoreFake(initial?: { cursor?: UploadCursor; projectId?: string }): CursorStoreFake {
  const persisted: UploadCursor[] = [];
  const store: UploadCursorStore = {
    async load() {
      return { cursor: initial?.cursor ?? createEmptyUploadCursor(), projectId: initial?.projectId ?? '' };
    },
    async persist(cursor) {
      persisted.push(cursor);
    },
  };
  return { store, persisted };
}

type FetcherFake = { fetcher: ExportContentFetcher };

function makeFetcherFake(payload?: {
  translationStrings?: TranslatableContent;
  perCollectionWithHashes?: Array<{
    collection: string;
    items: Array<{ id: string | number; content: TranslatableContent; hash: string }>;
  }>;
}): FetcherFake {
  const fetcher: ExportContentFetcher = {
    async fetchExportPayload() {
      return {
        translationStrings: payload?.translationStrings ?? { sourceLanguage: {}, otherLanguages: {} },
        perCollectionWithHashes: payload?.perCollectionWithHashes ?? [],
      };
    },
  };
  return { fetcher };
}

type ExecutorFake = {
  executor: ExportExecutor;
  calls: Array<Parameters<ExportExecutor['exportContentToLocalazy']>[0]>;
};

function makeExecutorFake(opts: { emitWrites?: UploadedTriple[]; throwOnExport?: Error } = {}): ExecutorFake {
  const calls: Array<Parameters<ExportExecutor['exportContentToLocalazy']>[0]> = [];
  const executor: ExportExecutor = {
    async exportContentToLocalazy(input) {
      calls.push(input);
      if (opts.emitWrites && opts.emitWrites.length > 0) {
        input.onWritten(opts.emitWrites);
      }
      if (opts.throwOnExport) {
        throw opts.throwOnExport;
      }
    },
  };
  return { executor, calls };
}

type SyncLogWriterFake = {
  writer: SyncLogWriter;
  starts: Array<Parameters<SyncLogWriter['startSession']>[0]>;
  entries: Array<{ sessionId: string; entry: Parameters<SyncLogWriter['appendEntry']>[1] }>;
  finishes: Array<{ id: string; params: Parameters<SyncLogWriter['finish']>[1] }>;
};

function makeSyncLogWriterFake(): SyncLogWriterFake {
  const starts: Array<Parameters<SyncLogWriter['startSession']>[0]> = [];
  const entries: Array<{ sessionId: string; entry: Parameters<SyncLogWriter['appendEntry']>[1] }> = [];
  const finishes: Array<{ id: string; params: Parameters<SyncLogWriter['finish']>[1] }> = [];
  let counter = 0;
  const writer: SyncLogWriter = {
    async startSession(params) {
      starts.push(params);
      return `sess-${++counter}`;
    },
    async appendEntry(sessionId, entry) {
      entries.push({ sessionId, entry });
    },
    async finish(id, params) {
      finishes.push({ id, params });
    },
  };
  return { writer, starts, entries, finishes };
}

function buildAdapters(overrides: Partial<ExportOrchestratorAdapters> = {}): ExportOrchestratorAdapters {
  return {
    uploadCursorStore: overrides.uploadCursorStore ?? makeCursorStoreFake().store,
    contentFetcher: overrides.contentFetcher ?? makeFetcherFake().fetcher,
    exportExecutor: overrides.exportExecutor ?? makeExecutorFake().executor,
    progress: overrides.progress ?? makeProgressFake().sink,
    syncLogWriter: overrides.syncLogWriter,
    syncLogInitiator: overrides.syncLogInitiator,
  };
}

function buildParams(overrides: Partial<IncrementalExportParams> = {}): IncrementalExportParams {
  return {
    mode: overrides.mode ?? 'incremental',
    settings: overrides.settings ?? emptySettings(),
    enabledFields: overrides.enabledFields ?? [],
    synchronizeTranslationStrings: overrides.synchronizeTranslationStrings ?? false,
    localazyProject: overrides.localazyProject ?? fakeProject(),
    sourceLanguageName: overrides.sourceLanguageName,
  };
}

/* -------------------------------------------------------------------------- */
/*  Tests                                                                     */
/* -------------------------------------------------------------------------- */

describe('runIncrementalExport', () => {
  describe('short-circuit (nothing to upload)', () => {
    it('returns status=skipped with an "up to date" summary when no items + no strings', async () => {
      const { sink, emitted } = makeProgressFake();
      const result = await runIncrementalExport(buildAdapters({ progress: sink }), buildParams());

      expect(result.status).toBe('skipped');
      expect(result.itemsProcessed).toBe(0);
      expect(result.summary).toMatch(/Already up to date/);
      expect(emitted.some((e) => e.id === ExportProgressIds.UPLOAD_UP_TO_DATE)).toBe(true);
    });

    it('still persists the in-memory cursor on skipped (touches last_sync_at via merge)', async () => {
      const cursorFake = makeCursorStoreFake();
      await runIncrementalExport(buildAdapters({ uploadCursorStore: cursorFake.store }), buildParams());
      expect(cursorFake.persisted).toHaveLength(1);
    });
  });

  describe('cursor invalidation', () => {
    it('uses the on-disk cursor when project ids match (incremental)', async () => {
      const existingCursor: UploadCursor = { uploaded_hashes: { posts: { '1': 'aaaa' } } };
      const cursorFake = makeCursorStoreFake({ cursor: existingCursor, projectId: 'proj-1' });
      // Item already in cursor → filter excludes it → no work → skipped path.
      const fetcher = makeFetcherFake({
        perCollectionWithHashes: [
          { collection: 'posts', items: [{ id: '1', hash: 'aaaa', content: { sourceLanguage: {}, otherLanguages: {} } }] },
        ],
      });
      const result = await runIncrementalExport(
        buildAdapters({ uploadCursorStore: cursorFake.store, contentFetcher: fetcher.fetcher }),
        buildParams({ localazyProject: fakeProject('proj-1') }),
      );
      expect(result.status).toBe('skipped');
    });

    it('treats the cursor as empty when project ids mismatch (incremental)', async () => {
      const existingCursor: UploadCursor = { uploaded_hashes: { posts: { '1': 'aaaa' } } };
      const cursorFake = makeCursorStoreFake({ cursor: existingCursor, projectId: 'old-project' });
      const fetcher = makeFetcherFake({
        perCollectionWithHashes: [
          { collection: 'posts', items: [{ id: '1', hash: 'aaaa', content: { sourceLanguage: { en: { x: 'y' } }, otherLanguages: {} } }] },
        ],
      });
      const executor = makeExecutorFake({ emitWrites: [{ collection: 'posts', itemId: '1', hash: 'aaaa' }] });

      const result = await runIncrementalExport(
        buildAdapters({ uploadCursorStore: cursorFake.store, contentFetcher: fetcher.fetcher, exportExecutor: executor.executor }),
        buildParams({ localazyProject: fakeProject('proj-1') }),
      );

      expect(result.status).toBe('completed');
      expect(result.itemsProcessed).toBe(1);
    });

    it('treats the cursor as empty on full mode even when project ids match', async () => {
      const existingCursor: UploadCursor = { uploaded_hashes: { posts: { '1': 'aaaa' } } };
      const cursorFake = makeCursorStoreFake({ cursor: existingCursor, projectId: 'proj-1' });
      const fetcher = makeFetcherFake({
        perCollectionWithHashes: [
          { collection: 'posts', items: [{ id: '1', hash: 'aaaa', content: { sourceLanguage: { en: { x: 'y' } }, otherLanguages: {} } }] },
        ],
      });
      const executor = makeExecutorFake({ emitWrites: [{ collection: 'posts', itemId: '1', hash: 'aaaa' }] });

      const result = await runIncrementalExport(
        buildAdapters({ uploadCursorStore: cursorFake.store, contentFetcher: fetcher.fetcher, exportExecutor: executor.executor }),
        buildParams({ mode: 'full', localazyProject: fakeProject('proj-1') }),
      );

      expect(result.status).toBe('completed');
      expect(result.itemsProcessed).toBe(1);
    });
  });

  describe('happy path', () => {
    it('returns status=completed with the executor result, persists cursor, emits CHANGES_SUMMARY + FINISHED', async () => {
      const { sink, emitted } = makeProgressFake();
      const cursorFake = makeCursorStoreFake();
      const fetcher = makeFetcherFake({
        perCollectionWithHashes: [
          {
            collection: 'posts',
            items: [
              { id: '1', hash: 'h1', content: { sourceLanguage: { en: { title: 'a' } }, otherLanguages: {} } },
              { id: '2', hash: 'h2', content: { sourceLanguage: { en: { title: 'b' } }, otherLanguages: {} } },
            ],
          },
        ],
      });
      const executor = makeExecutorFake({
        emitWrites: [
          { collection: 'posts', itemId: '1', hash: 'h1' },
          { collection: 'posts', itemId: '2', hash: 'h2' },
        ],
      });

      const result = await runIncrementalExport(
        buildAdapters({
          progress: sink,
          uploadCursorStore: cursorFake.store,
          contentFetcher: fetcher.fetcher,
          exportExecutor: executor.executor,
        }),
        buildParams(),
      );

      expect(result.status).toBe('completed');
      expect(result.itemsProcessed).toBe(2);
      expect(result.summary).toMatch(/Uploaded 2 items in/);
      // Final flush in `finally` always lands one persist.
      expect(cursorFake.persisted.length).toBeGreaterThanOrEqual(1);
      // Cursor recorded the writes.
      const finalPersisted = cursorFake.persisted[cursorFake.persisted.length - 1]!;
      expect(finalPersisted.uploaded_hashes.posts).toEqual({ '1': 'h1', '2': 'h2' });
      expect(emitted.some((e) => e.id === ExportProgressIds.UPLOAD_CHANGES_SUMMARY)).toBe(true);
      expect(emitted.some((e) => e.id === ExportProgressIds.UPLOAD_FINISHED)).toBe(true);
    });

    it('builds the trackedItems map with the right collection grouping', async () => {
      const fetcher = makeFetcherFake({
        perCollectionWithHashes: [
          {
            collection: 'posts',
            items: [{ id: 'p1', hash: 'h-p1', content: { sourceLanguage: { en: { title: 'p' } }, otherLanguages: {} } }],
          },
          {
            collection: 'pages',
            items: [{ id: 'g1', hash: 'h-g1', content: { sourceLanguage: { en: { name: 'g' } }, otherLanguages: {} } }],
          },
        ],
      });
      const executor = makeExecutorFake();

      await runIncrementalExport(buildAdapters({ contentFetcher: fetcher.fetcher, exportExecutor: executor.executor }), buildParams());

      expect(executor.calls).toHaveLength(1);
      const tracked = executor.calls[0]!.trackedItems;
      expect(tracked.get('posts')).toEqual([{ id: 'p1', hash: 'h-p1' }]);
      expect(tracked.get('pages')).toEqual([{ id: 'g1', hash: 'h-g1' }]);
    });

    it('emits a generic "Upload completed" message when only translation strings were pushed', async () => {
      const { sink, emitted } = makeProgressFake();
      const fetcher = makeFetcherFake({
        translationStrings: { sourceLanguage: { en: { greet: 'hi' } }, otherLanguages: {} },
        perCollectionWithHashes: [],
      });
      const executor = makeExecutorFake(); // No onWritten emissions — translation strings aren't cursor-tracked.

      const result = await runIncrementalExport(
        buildAdapters({ progress: sink, contentFetcher: fetcher.fetcher, exportExecutor: executor.executor }),
        buildParams({ synchronizeTranslationStrings: true }),
      );

      expect(result.status).toBe('completed');
      expect(result.itemsProcessed).toBe(0);
      expect(result.summary).toMatch(/Upload completed in/);
      expect(emitted.some((e) => e.id === ExportProgressIds.UPLOAD_FINISHED)).toBe(true);
    });
  });

  describe('failure path', () => {
    it('re-throws the executor error after persisting the in-memory cursor', async () => {
      const cursorFake = makeCursorStoreFake();
      const fetcher = makeFetcherFake({
        perCollectionWithHashes: [
          { collection: 'posts', items: [{ id: '1', hash: 'h1', content: { sourceLanguage: { en: { x: 'y' } }, otherLanguages: {} } }] },
        ],
      });
      const executor = makeExecutorFake({ throwOnExport: new Error('push failed') });

      await expect(
        runIncrementalExport(
          buildAdapters({ uploadCursorStore: cursorFake.store, contentFetcher: fetcher.fetcher, exportExecutor: executor.executor }),
          buildParams(),
        ),
      ).rejects.toThrow('push failed');

      // The body's inner `try / finally` runs the cursor persist before the throw escapes.
      expect(cursorFake.persisted.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('sync-log session lifecycle', () => {
    it('opens a session before the body and finalises with completed on a happy path', async () => {
      const writerFake = makeSyncLogWriterFake();
      const fetcher = makeFetcherFake({
        perCollectionWithHashes: [
          { collection: 'posts', items: [{ id: '1', hash: 'h1', content: { sourceLanguage: { en: { x: 'y' } }, otherLanguages: {} } }] },
        ],
      });
      const executor = makeExecutorFake({ emitWrites: [{ collection: 'posts', itemId: '1', hash: 'h1' }] });

      await runIncrementalExport(
        buildAdapters({
          contentFetcher: fetcher.fetcher,
          exportExecutor: executor.executor,
          syncLogWriter: writerFake.writer,
          syncLogInitiator: { initiator: 'user-7', initiatorUser: 'user-7' },
        }),
        buildParams(),
      );

      expect(writerFake.starts).toHaveLength(1);
      expect(writerFake.starts[0]!.eventType).toBe('upload-incremental');
      expect(writerFake.starts[0]!.initiator).toBe('user-7');

      expect(writerFake.finishes).toHaveLength(1);
      expect(writerFake.finishes[0]!.params.status).toBe('completed');
      expect(writerFake.finishes[0]!.params.itemsProcessed).toBe(1);
    });

    it('uses event_type "upload-full" for full mode', async () => {
      const writerFake = makeSyncLogWriterFake();
      await runIncrementalExport(
        buildAdapters({
          syncLogWriter: writerFake.writer,
          syncLogInitiator: { initiator: 'u', initiatorUser: 'u' },
        }),
        buildParams({ mode: 'full' }),
      );
      expect(writerFake.starts[0]!.eventType).toBe('upload-full');
    });

    it('finalises with status=failed and a summary built from the thrown error', async () => {
      const writerFake = makeSyncLogWriterFake();
      const fetcher = makeFetcherFake({
        perCollectionWithHashes: [
          { collection: 'posts', items: [{ id: '1', hash: 'h1', content: { sourceLanguage: { en: { x: 'y' } }, otherLanguages: {} } }] },
        ],
      });
      const executor = makeExecutorFake({ throwOnExport: new Error('boom') });

      await expect(
        runIncrementalExport(
          buildAdapters({
            contentFetcher: fetcher.fetcher,
            exportExecutor: executor.executor,
            syncLogWriter: writerFake.writer,
            syncLogInitiator: { initiator: 'u', initiatorUser: 'u' },
          }),
          buildParams(),
        ),
      ).rejects.toThrow('boom');

      expect(writerFake.finishes).toHaveLength(1);
      expect(writerFake.finishes[0]!.params.status).toBe('failed');
      expect(writerFake.finishes[0]!.params.summary).toMatch(/Upload failed: boom/);
    });

    it('finalises with status=skipped when the empty short-circuit fires', async () => {
      const writerFake = makeSyncLogWriterFake();
      await runIncrementalExport(
        buildAdapters({
          syncLogWriter: writerFake.writer,
          syncLogInitiator: { initiator: 'u', initiatorUser: 'u' },
        }),
        buildParams(),
      );
      expect(writerFake.finishes[0]!.params.status).toBe('skipped');
    });

    it('proceeds without logging when startSession throws (best-effort)', async () => {
      const writerFake = makeSyncLogWriterFake();
      writerFake.writer.startSession = vi.fn().mockRejectedValue(new Error('session-collection-missing'));
      // Should not throw — the run proceeds without a log session.
      const result = await runIncrementalExport(
        buildAdapters({
          syncLogWriter: writerFake.writer,
          syncLogInitiator: { initiator: 'u', initiatorUser: 'u' },
        }),
        buildParams(),
      );
      expect(result.status).toBe('skipped');
      // Nothing to finalise because we never got a session id.
      expect(writerFake.finishes).toHaveLength(0);
    });

    it('does not open a session when no writer is supplied', async () => {
      const writerFake = makeSyncLogWriterFake();
      await runIncrementalExport(buildAdapters({ syncLogInitiator: { initiator: 'u', initiatorUser: 'u' } }), buildParams());
      expect(writerFake.starts).toHaveLength(0);
    });

    it('does not open a session when no initiator is supplied', async () => {
      const writerFake = makeSyncLogWriterFake();
      await runIncrementalExport(buildAdapters({ syncLogWriter: writerFake.writer }), buildParams());
      expect(writerFake.starts).toHaveLength(0);
    });
  });

  describe('sync-log milestone entries', () => {
    it('writes started → changes-summary → per-collection → upload-finished entries on a happy path', async () => {
      const writerFake = makeSyncLogWriterFake();
      const fetcher = makeFetcherFake({
        perCollectionWithHashes: [
          {
            collection: 'posts',
            items: [
              { id: '1', hash: 'h1', content: { sourceLanguage: { en: { title: 'a' } }, otherLanguages: {} } },
              { id: '2', hash: 'h2', content: { sourceLanguage: { en: { body: 'b' } }, otherLanguages: {} } },
            ],
          },
        ],
      });
      const executor = makeExecutorFake({
        emitWrites: [
          { collection: 'posts', itemId: '1', hash: 'h1' },
          { collection: 'posts', itemId: '2', hash: 'h2' },
        ],
      });

      await runIncrementalExport(
        buildAdapters({
          contentFetcher: fetcher.fetcher,
          exportExecutor: executor.executor,
          syncLogWriter: writerFake.writer,
          syncLogInitiator: { initiator: 'user-7', initiatorUser: 'user-7' },
        }),
        buildParams(),
      );

      const messages = writerFake.entries.map((e) => e.entry.message);
      expect(messages.some((m) => m.startsWith('Incremental upload started'))).toBe(true);
      expect(messages.some((m) => m.startsWith('Found '))).toBe(true);
      expect(messages.some((m) => m === 'posts: 2 items uploaded')).toBe(true);
      expect(messages.some((m) => m.startsWith('Uploaded 2 items in'))).toBe(true);
    });

    it('writes a started + up-to-date entry when the empty short-circuit fires', async () => {
      const writerFake = makeSyncLogWriterFake();
      await runIncrementalExport(
        buildAdapters({
          syncLogWriter: writerFake.writer,
          syncLogInitiator: { initiator: 'u', initiatorUser: 'u' },
        }),
        buildParams(),
      );
      const messages = writerFake.entries.map((e) => e.entry.message);
      expect(messages).toContainEqual(expect.stringMatching(/^Incremental upload started/));
      expect(messages).toContainEqual(expect.stringMatching(/^Already up to date/));
    });

    it('writes a Full upload started line when mode is full', async () => {
      const writerFake = makeSyncLogWriterFake();
      await runIncrementalExport(
        buildAdapters({
          syncLogWriter: writerFake.writer,
          syncLogInitiator: { initiator: 'u', initiatorUser: 'u' },
        }),
        buildParams({ mode: 'full' }),
      );
      const messages = writerFake.entries.map((e) => e.entry.message);
      expect(messages[0]).toBe('Full upload started');
    });

    it('writes an error-level entry when the upload step throws', async () => {
      const writerFake = makeSyncLogWriterFake();
      const fetcher = makeFetcherFake({
        perCollectionWithHashes: [
          {
            collection: 'posts',
            items: [{ id: '1', hash: 'h1', content: { sourceLanguage: { en: { title: 'Hi' } }, otherLanguages: {} } }],
          },
        ],
      });
      const executor = makeExecutorFake({ throwOnExport: new Error('boom') });

      await expect(
        runIncrementalExport(
          buildAdapters({
            contentFetcher: fetcher.fetcher,
            exportExecutor: executor.executor,
            syncLogWriter: writerFake.writer,
            syncLogInitiator: { initiator: 'u', initiatorUser: 'u' },
          }),
          buildParams(),
        ),
      ).rejects.toThrow('boom');

      const errorEntry = writerFake.entries.find((e) => e.entry.level === 'error');
      expect(errorEntry?.entry.message).toMatch(/Upload failed: boom/);
    });

    it('surfaces the non-empty subcount in the changes-summary entry when some strings are blank', async () => {
      const writerFake = makeSyncLogWriterFake();
      const fetcher = makeFetcherFake({
        perCollectionWithHashes: [
          {
            collection: 'posts',
            items: [
              {
                id: '1',
                hash: 'h1',
                content: { sourceLanguage: { en: { title: 'Hi', body: '', cta: '   ' } }, otherLanguages: {} },
              },
            ],
          },
        ],
      });
      const executor = makeExecutorFake({ emitWrites: [{ collection: 'posts', itemId: '1', hash: 'h1' }] });

      await runIncrementalExport(
        buildAdapters({
          contentFetcher: fetcher.fetcher,
          exportExecutor: executor.executor,
          syncLogWriter: writerFake.writer,
          syncLogInitiator: { initiator: 'u', initiatorUser: 'u' },
        }),
        buildParams(),
      );

      const summaryEntry = writerFake.entries.find((e) => e.entry.message.startsWith('Found '));
      expect(summaryEntry?.entry.message).toMatch(/3 entries in en \(1 non-empty\)/);
    });

    it('renders the source language as "Name (code)" when sourceLanguageName is provided', async () => {
      const writerFake = makeSyncLogWriterFake();
      const fetcher = makeFetcherFake({
        perCollectionWithHashes: [
          {
            collection: 'posts',
            items: [{ id: '1', hash: 'h1', content: { sourceLanguage: { en: { title: 'Hi' } }, otherLanguages: {} } }],
          },
        ],
      });
      const executor = makeExecutorFake({ emitWrites: [{ collection: 'posts', itemId: '1', hash: 'h1' }] });

      await runIncrementalExport(
        buildAdapters({
          contentFetcher: fetcher.fetcher,
          exportExecutor: executor.executor,
          syncLogWriter: writerFake.writer,
          syncLogInitiator: { initiator: 'u', initiatorUser: 'u' },
        }),
        buildParams({ sourceLanguageName: 'English' }),
      );

      const summaryEntry = writerFake.entries.find((e) => e.entry.message.startsWith('Found '));
      expect(summaryEntry?.entry.message).toContain('entries in English (en)');
    });

    it('writes a translation-strings line when translation entries are present', async () => {
      const writerFake = makeSyncLogWriterFake();
      const fetcher = makeFetcherFake({
        translationStrings: {
          sourceLanguage: { translation_string: { key1: 'Hello' } },
          otherLanguages: { fr: { translation_string: { key1: 'Salut' } } },
        },
      });

      await runIncrementalExport(
        buildAdapters({
          contentFetcher: fetcher.fetcher,
          syncLogWriter: writerFake.writer,
          syncLogInitiator: { initiator: 'u', initiatorUser: 'u' },
        }),
        buildParams({ synchronizeTranslationStrings: true }),
      );

      const messages = writerFake.entries.map((e) => e.entry.message);
      expect(messages).toContainEqual(expect.stringMatching(/^Translation strings: 1 entry uploaded/));
    });
  });
});
