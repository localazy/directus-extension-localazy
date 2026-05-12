import { defineStore } from 'pinia';
import { createSingletonStore } from './singleton-factory';
import { LOCALAZY_COLLECTIONS } from './localazy-installer-store';
import { defaultConfiguration } from '../data/default-configuration';
import type { SyncState } from '../../../common/models/collections-data/sync-state';

/**
 * Singleton store for the download-sync cursor (`localazy_sync_state`).
 *
 * The store itself is a thin singleton wrapper — the orchestration logic
 * (auto-invalidate by project, merge-on-persist, throttled flush) lives in
 * `use-sync-container-actions.ts`. Keeping this store minimal mirrors how the
 * other singletons (settings, config, transfer setup) work.
 */
export const useLocalazySyncStateStore = defineStore(
  'localazySyncState',
  createSingletonStore<SyncState>(LOCALAZY_COLLECTIONS.syncState, defaultConfiguration().sync_state),
);
