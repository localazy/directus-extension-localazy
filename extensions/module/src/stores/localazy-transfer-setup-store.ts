import { defineStore } from 'pinia';
import { createSingletonStore } from './singleton-factory';
import { LOCALAZY_COLLECTIONS } from './localazy-installer-store';
import { defaultConfiguration } from '../data/default-configuration';
import type { ContentTransferSetupDatabase } from '../../../common/models/collections-data/content-transfer-setup';

export const useLocalazyTransferSetupStore = defineStore(
  'localazyTransferSetup',
  createSingletonStore<ContentTransferSetupDatabase>(
    LOCALAZY_COLLECTIONS.contentTransferSetup,
    defaultConfiguration().content_transfer_setup,
  ),
);
