import { SyncLogSession } from '../../../common/models/collections-data/sync-log';
import { createSyncLogWriter as createDeepSyncLogWriter, SyncLogStorage } from '../../../common/services/orchestrator/sync-log-writer';
import { SyncLogWriter } from '../../../common/services/orchestrator/ports';

/**
 * Minimal HTTP surface this adapter talks through. Modelled after the slice of
 * `useApi()`'s axios-like client we actually use here, so unit tests can supply a
 * trivial fake without pulling in Directus' SDK.
 *
 * `get` returns whatever Directus serves on the requested URL — a single row object for
 * `/items/{collection}/{id}`, an array for `/items/{collection}`. The adapter narrows
 * downstream.
 */
export interface SyncLogHttpClient {
  post(url: string, data: unknown): Promise<{ data: { data: { id: string } } }>;
  patch(url: string, data: unknown): Promise<unknown>;
  get(url: string, config?: { params?: Record<string, unknown> }): Promise<{ data: { data: unknown } }>;
  delete(url: string, config?: { data?: unknown }): Promise<unknown>;
}

/**
 * Opaque session-id generator. Prefers `crypto.randomUUID()` (real UUID v4) when
 * available; falls back to a `Date.now() + Math.random()` composite otherwise. The id is
 * only used as a primary key — uniqueness is enough, no UUID semantics required.
 */
function generateSessionId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Module-side `SyncLogStorage` adapter — translates the writer's column-aware storage
 * operations into Directus-shaped axios calls against `/items/{collection}`. The
 * orchestration (per-session append chain, retention rule, error swallowing, failure
 * callback) lives in the deep writer in `common/`; this adapter is the transport seam.
 *
 * The deep writer's contract requires `readEntries` to re-throw on read failure so the
 * subsequent write is skipped — without that, a transient GET error would let the
 * caller's `doAppend` overwrite the on-disk entries with a single-element array. The
 * axios shape used here propagates errors naturally, so no extra guarding is needed.
 */
export function createBrowserSyncLogStorage(api: SyncLogHttpClient, collectionName: string): SyncLogStorage {
  return {
    async createSession(row: SyncLogSession) {
      await api.post(`/items/${collectionName}`, row);
    },
    async readEntries(id) {
      const result = await api.get(`/items/${collectionName}/${id}`);
      const row = (result.data.data ?? {}) as { entries?: string };
      return row.entries ?? '[]';
    },
    async writeEntries(id, entriesJson) {
      await api.patch(`/items/${collectionName}/${id}`, { entries: entriesJson });
    },
    async writeFinish(id, fields) {
      await api.patch(`/items/${collectionName}/${id}`, fields);
    },
    async listIdsByStartedAtDesc() {
      const list = await api.get(`/items/${collectionName}`, {
        params: { limit: -1, sort: '-started_at', fields: ['id'] },
      });
      const rows = (list.data.data ?? []) as Array<{ id: string }>;
      return rows.map((row) => row.id);
    },
    async deleteByIds(ids) {
      await api.delete(`/items/${collectionName}`, { data: ids });
    },
  };
}

type CreateSyncLogWriterInput = {
  api: SyncLogHttpClient;
  collectionName: string;
  /** Override for tests — production callers let the writer mint UUIDs internally. */
  generateId?: () => string;
};

/**
 * Module-side convenience wrapper: builds the browser `SyncLogStorage` adapter and hands
 * it to the deep writer from `common/`. The two module-side callers (the upload-path
 * writer in `use-sync-container-actions` and the download-path orchestrator adapters)
 * both go through this so the storage + id-generator pairing stays in one place.
 */
export function createSyncLogWriter(input: CreateSyncLogWriterInput): SyncLogWriter {
  return createDeepSyncLogWriter({
    storage: createBrowserSyncLogStorage(input.api, input.collectionName),
    generateId: input.generateId ?? generateSessionId,
  });
}
