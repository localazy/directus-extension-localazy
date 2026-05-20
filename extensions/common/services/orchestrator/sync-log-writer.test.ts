import { describe, expect, it, vi } from 'vitest';
import { SYNC_LOG_RETENTION, SyncLogEntry, SyncLogSession } from '../../models/collections-data/sync-log';
import { createSyncLogWriter, SyncLogStorage } from './sync-log-writer';

/* -------------------------------------------------------------------------- */
/*  Fake storage                                                              */
/* -------------------------------------------------------------------------- */

type StorageCalls = {
  createSession: Array<SyncLogSession>;
  readEntries: Array<string>;
  writeEntries: Array<{ id: string; json: string }>;
  writeFinish: Array<{ id: string; fields: { status: string; finished_at: string; summary: string; items_processed: number } }>;
  listIdsByStartedAtDesc: number;
  deleteByIds: Array<string[]>;
};

type StoredRow = Pick<SyncLogSession, 'id' | 'entries' | 'started_at'>;

/**
 * In-memory `SyncLogStorage` fake. Keeps a `Map<id, row>` so read-modify-write cycles on
 * `entries` are observable end-to-end, and records every call for direct assertion.
 */
function makeFakeStorage(seedRows: ReadonlyArray<StoredRow> = []): {
  storage: SyncLogStorage;
  calls: StorageCalls;
  rows: Map<string, StoredRow>;
} {
  const rows = new Map<string, StoredRow>();
  seedRows.forEach((r) => rows.set(r.id, { ...r }));
  const calls: StorageCalls = {
    createSession: [],
    readEntries: [],
    writeEntries: [],
    writeFinish: [],
    listIdsByStartedAtDesc: 0,
    deleteByIds: [],
  };

  const storage: SyncLogStorage = {
    async createSession(row) {
      calls.createSession.push(row);
      rows.set(row.id, { id: row.id, entries: row.entries, started_at: row.started_at });
    },
    async readEntries(id) {
      calls.readEntries.push(id);
      const row = rows.get(id);
      if (!row) return '[]';
      return row.entries;
    },
    async writeEntries(id, json) {
      calls.writeEntries.push({ id, json });
      const existing = rows.get(id);
      if (existing) rows.set(id, { ...existing, entries: json });
    },
    async writeFinish(id, fields) {
      calls.writeFinish.push({ id, fields });
    },
    async listIdsByStartedAtDesc() {
      calls.listIdsByStartedAtDesc += 1;
      return Array.from(rows.values())
        .sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at))
        .map((r) => r.id);
    },
    async deleteByIds(ids) {
      calls.deleteByIds.push(ids);
      ids.forEach((id) => rows.delete(id));
    },
  };

  return { storage, calls, rows };
}

/** Build a writer wired to a fresh fake storage with a deterministic id factory. */
function makeWriter(seed: ReadonlyArray<StoredRow> = [], onFailure?: Parameters<typeof createSyncLogWriter>[0]['onFailure']) {
  let counter = 0;
  const { storage, calls, rows } = makeFakeStorage(seed);
  const writer = createSyncLogWriter({
    storage,
    generateId: () => `session-${++counter}`,
    onFailure,
  });
  return { writer, storage, calls, rows };
}

/* -------------------------------------------------------------------------- */
/*  Tests                                                                     */
/* -------------------------------------------------------------------------- */

describe('createSyncLogWriter', () => {
  describe('startSession', () => {
    it('creates an in_progress row with the supplied metadata and returns the new id', async () => {
      const { writer, calls } = makeWriter();
      const id = await writer.startSession({ eventType: 'download-incremental', initiator: 'user-7', initiatorUser: 'user-7' });

      expect(id).toBe('session-1');
      expect(calls.createSession).toHaveLength(1);
      const row = calls.createSession[0]!;
      expect(row.id).toBe('session-1');
      expect(row.event_type).toBe('download-incremental');
      expect(row.status).toBe('in_progress');
      expect(row.initiator).toBe('user-7');
      expect(row.initiator_user).toBe('user-7');
      expect(row.summary).toBe('');
      expect(row.items_processed).toBe(0);
      expect(row.finished_at).toBeNull();
      expect(row.entries).toBe('[]');
    });

    it('propagates errors so the orchestrator never holds an invalid session id', async () => {
      const { writer, storage } = makeWriter();
      storage.createSession = async () => {
        throw new Error('boom');
      };
      await expect(writer.startSession({ eventType: 'upload-full', initiator: 'u', initiatorUser: 'u' })).rejects.toThrow('boom');
    });
  });

  describe('appendEntry', () => {
    it('reads, parses, pushes, and writes the entries array back', async () => {
      const { writer, rows } = makeWriter();
      const id = await writer.startSession({ eventType: 'download-incremental', initiator: 'u', initiatorUser: 'u' });
      await writer.appendEntry(id, { timestamp: '2026-05-12T12:00:00Z', level: 'info', message: 'one' });
      await writer.appendEntry(id, { timestamp: '2026-05-12T12:00:01Z', level: 'info', message: 'two' });

      const stored = JSON.parse(rows.get(id)!.entries) as SyncLogEntry[];
      expect(stored.map((e) => e.message)).toEqual(['one', 'two']);
    });

    it('serialises concurrent appends on the same session (no lost entries)', async () => {
      // Make the storage's read deliberately slow so two appends overlap. Without the
      // per-session chain, the second writeEntries would clobber the first's append
      // because both reads see the same starting state before either write lands.
      const { writer, rows, storage } = makeWriter();
      const id = await writer.startSession({ eventType: 'download-incremental', initiator: 'u', initiatorUser: 'u' });
      const originalRead = storage.readEntries.bind(storage);
      let readCount = 0;
      storage.readEntries = async (sid) => {
        readCount += 1;
        if (readCount === 1) await new Promise((r) => setTimeout(r, 10));
        return originalRead(sid);
      };

      void writer.appendEntry(id, { timestamp: '2026-05-13T00:00:00Z', level: 'info', message: 'first' });
      await writer.appendEntry(id, { timestamp: '2026-05-13T00:00:01Z', level: 'info', message: 'second' });

      // Both appends are now in flight along the chain — wait for the cleanup tail.
      await new Promise((r) => setTimeout(r, 30));
      const parsed = JSON.parse(rows.get(id)!.entries) as SyncLogEntry[];
      expect(parsed.map((e) => e.message)).toEqual(['first', 'second']);
    });

    it('does not serialise across distinct sessions', async () => {
      const { writer, rows } = makeWriter();
      const a = await writer.startSession({ eventType: 'download-incremental', initiator: 'u', initiatorUser: 'u' });
      const b = await writer.startSession({ eventType: 'upload-incremental', initiator: 'u', initiatorUser: 'u' });
      await Promise.all([
        writer.appendEntry(a, { timestamp: 'x', level: 'info', message: 'in-a' }),
        writer.appendEntry(b, { timestamp: 'y', level: 'info', message: 'in-b' }),
      ]);

      expect(JSON.parse(rows.get(a)!.entries)).toEqual([{ timestamp: 'x', level: 'info', message: 'in-a' }]);
      expect(JSON.parse(rows.get(b)!.entries)).toEqual([{ timestamp: 'y', level: 'info', message: 'in-b' }]);
    });

    it('swallows write errors so a single failed append does not break the chain', async () => {
      const { writer, storage } = makeWriter();
      const id = await writer.startSession({ eventType: 'download-incremental', initiator: 'u', initiatorUser: 'u' });
      const originalWrite = storage.writeEntries.bind(storage);
      let failNext = true;
      storage.writeEntries = async (sid, json) => {
        if (failNext) {
          failNext = false;
          throw new Error('transient');
        }
        return originalWrite(sid, json);
      };

      await expect(writer.appendEntry(id, { timestamp: 'a', level: 'info', message: 'lost' })).resolves.toBeUndefined();
      // The next append still succeeds — chain wasn't poisoned by the prior failure.
      await expect(writer.appendEntry(id, { timestamp: 'b', level: 'info', message: 'kept' })).resolves.toBeUndefined();
    });

    it('skips the write when readEntries throws (entries column never overwritten with a single-element array)', async () => {
      const { writer, calls, storage } = makeWriter();
      const id = await writer.startSession({ eventType: 'download-incremental', initiator: 'u', initiatorUser: 'u' });
      storage.readEntries = async () => {
        throw new Error('read failed');
      };

      await writer.appendEntry(id, { timestamp: 'a', level: 'info', message: 'never-written' });

      // No writeEntries call landed at all because the read threw first.
      expect(calls.writeEntries).toHaveLength(0);
    });
  });

  describe('finish', () => {
    it('writes terminal fields and triggers a retention trim', async () => {
      // Seed exactly SYNC_LOG_RETENTION + 5 rows so the trim removes 5 (the writer's
      // own new row would push it one over, but the new row gets retained as newest).
      const seed: StoredRow[] = [];
      const overflow = 5;
      for (let i = 0; i < SYNC_LOG_RETENTION + overflow - 1; i += 1) {
        // -1 because the writer's startSession adds one more.
        seed.push({
          id: `seed-${i.toString().padStart(3, '0')}`,
          entries: '[]',
          started_at: new Date(2026, 0, 1, 0, 0, i).toISOString(),
        });
      }
      const { writer, calls, rows } = makeWriter(seed);
      await writer.startSession({ eventType: 'download-full', initiator: 'u', initiatorUser: 'u' });
      await writer.finish('session-1', { status: 'completed', summary: 'done', itemsProcessed: 42 });

      expect(calls.writeFinish).toHaveLength(1);
      const fin = calls.writeFinish[0]!;
      expect(fin.id).toBe('session-1');
      expect(fin.fields.status).toBe('completed');
      expect(fin.fields.summary).toBe('done');
      expect(fin.fields.items_processed).toBe(42);
      expect(typeof fin.fields.finished_at).toBe('string');

      expect(calls.deleteByIds).toHaveLength(1);
      expect(calls.deleteByIds[0]).toHaveLength(overflow);
      calls.deleteByIds[0]!.forEach((id) => expect(rows.has(id)).toBe(false));
    });

    it('does not call deleteByIds when the table is within retention', async () => {
      const { writer, calls } = makeWriter();
      await writer.startSession({ eventType: 'download-incremental', initiator: 'u', initiatorUser: 'u' });
      await writer.finish('session-1', { status: 'completed', summary: '', itemsProcessed: 0 });

      expect(calls.deleteByIds).toHaveLength(0);
    });

    it('swallows writeFinish errors and still attempts the trim', async () => {
      const { writer, storage, calls } = makeWriter();
      await writer.startSession({ eventType: 'download-incremental', initiator: 'u', initiatorUser: 'u' });
      storage.writeFinish = async () => {
        throw new Error('finalisation failed');
      };

      await expect(writer.finish('session-1', { status: 'completed', summary: '', itemsProcessed: 1 })).resolves.toBeUndefined();
      // The list-ids step still ran (the trim was attempted), even though writeFinish threw.
      expect(calls.listIdsByStartedAtDesc).toBe(1);
    });

    it('swallows trim failures', async () => {
      const { writer, storage } = makeWriter();
      await writer.startSession({ eventType: 'download-incremental', initiator: 'u', initiatorUser: 'u' });
      storage.listIdsByStartedAtDesc = async () => {
        throw new Error('list failed');
      };

      await expect(writer.finish('session-1', { status: 'completed', summary: '', itemsProcessed: 1 })).resolves.toBeUndefined();
    });
  });

  describe('onFailure callback', () => {
    it.each(['failed', 'partial', 'aborted'] as const)('fires onFailure when the terminal status is %s', async (status) => {
      const onFailure = vi.fn().mockResolvedValue(undefined);
      const { writer } = makeWriter([], onFailure);
      await writer.startSession({ eventType: 'webhook', initiator: 'webhook', initiatorUser: null });
      await writer.finish('session-1', { status, summary: 'oh no', itemsProcessed: 0 });

      expect(onFailure).toHaveBeenCalledTimes(1);
      expect(onFailure).toHaveBeenCalledWith('session-1', { status, summary: 'oh no', itemsProcessed: 0 });
    });

    it.each(['completed', 'skipped'] as const)('does not fire onFailure when the terminal status is %s', async (status) => {
      const onFailure = vi.fn().mockResolvedValue(undefined);
      const { writer } = makeWriter([], onFailure);
      await writer.startSession({ eventType: 'webhook', initiator: 'webhook', initiatorUser: null });
      await writer.finish('session-1', { status, summary: 'all good', itemsProcessed: 1 });

      expect(onFailure).not.toHaveBeenCalled();
    });

    it('is a no-op when not supplied', async () => {
      const { writer } = makeWriter();
      await writer.startSession({ eventType: 'webhook', initiator: 'webhook', initiatorUser: null });
      // Should not throw despite a failure status with no callback wired.
      await expect(writer.finish('session-1', { status: 'failed', summary: '', itemsProcessed: 0 })).resolves.toBeUndefined();
    });

    it('runs after writeFinish and after the retention trim', async () => {
      const order: string[] = [];
      const seed: StoredRow[] = [];
      for (let i = 0; i < SYNC_LOG_RETENTION; i += 1) {
        seed.push({
          id: `seed-${i.toString().padStart(3, '0')}`,
          entries: '[]',
          started_at: new Date(2026, 0, 1, 0, 0, i).toISOString(),
        });
      }
      const onFailure = vi.fn(async () => {
        order.push('onFailure');
      });
      const { writer, storage } = makeWriter(seed, onFailure);
      const originalFinish = storage.writeFinish.bind(storage);
      const originalDelete = storage.deleteByIds.bind(storage);
      storage.writeFinish = async (id, fields) => {
        order.push('writeFinish');
        return originalFinish(id, fields);
      };
      storage.deleteByIds = async (ids) => {
        order.push('deleteByIds');
        return originalDelete(ids);
      };

      await writer.startSession({ eventType: 'webhook', initiator: 'webhook', initiatorUser: null });
      await writer.finish('session-1', { status: 'failed', summary: 'x', itemsProcessed: 0 });

      expect(order).toEqual(['writeFinish', 'deleteByIds', 'onFailure']);
    });

    it('swallows callback errors so finish never propagates', async () => {
      const onFailure = vi.fn().mockRejectedValue(new Error('notification blew up'));
      const { writer } = makeWriter([], onFailure);
      await writer.startSession({ eventType: 'webhook', initiator: 'webhook', initiatorUser: null });
      await expect(writer.finish('session-1', { status: 'failed', summary: '', itemsProcessed: 0 })).resolves.toBeUndefined();
      expect(onFailure).toHaveBeenCalledTimes(1);
    });
  });
});
