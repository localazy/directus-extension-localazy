import type { MutationOptions, SchemaOverview } from '@directus/types';
import { SyncLogSession } from '@localazy/directus-common';
import { SyncLogStorage } from '@localazy/directus-common';
import { LOCALAZY_COLLECTIONS } from '@localazy/directus-common';
import type { ItemsServiceCtor } from '../hook/types/directus-services';

/**
 * Server-side `SyncLogStorage` adapter — translates the deep writer's column-aware
 * storage operations into `ItemsService` calls against `localazy_sync_log`. Always runs
 * under admin accountability (`accountability: null`) because the Sync-log table is
 * extension-internal state, not user-attributable. `emitEvents: false` on writes prevents
 * recursion back through the upload hook when an automated-export burst row is written.
 *
 * Lives here (not under `endpoint/` or `hook/`) because both the existing webhook
 * orchestrator (`runIncrementalImport`) and the upcoming hook-side burst coordinator
 * (PR 64) need to write to the same table with identical accountability semantics. The
 * function is intentionally tiny — orchestration (per-session promise chain, error
 * swallowing, retention trim, failure callback) lives in
 * `common/services/orchestrator/sync-log-writer.ts`. This module only provides the
 * `ItemsService`-backed transport layer.
 */
export function createServerSyncLogStorage(ItemsService: ItemsServiceCtor, schema: SchemaOverview): SyncLogStorage {
  function service() {
    return new ItemsService<Partial<SyncLogSession>>(LOCALAZY_COLLECTIONS.syncLog, { schema, accountability: null });
  }
  return {
    async createSession(row) {
      await service().createOne(row, { emitEvents: false } as MutationOptions);
    },
    async readEntries(id) {
      const row = await service().readOne(id);
      return row?.entries ?? '[]';
    },
    async writeEntries(id, entriesJson) {
      await service().updateOne(id, { entries: entriesJson }, { emitEvents: false } as MutationOptions);
    },
    async writeFinish(id, fields) {
      await service().updateOne(id, fields, { emitEvents: false } as MutationOptions);
    },
    async listIdsByStartedAtDesc() {
      const rows = await service().readByQuery({ limit: -1, sort: ['-started_at'], fields: ['id'] });
      return rows.map((r) => r.id).filter((id): id is string => typeof id === 'string');
    },
    async deleteByIds(ids) {
      await service().deleteMany(ids, { emitEvents: false } as MutationOptions);
    },
  };
}
