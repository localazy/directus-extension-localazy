import { defineStore } from 'pinia';
import { createSingletonStore } from './singleton-factory';
import { LOCALAZY_COLLECTIONS } from './localazy-installer-store';
import { defaultConfiguration } from '../data/default-configuration';
import type { LocalazyData } from '../../../common/models/collections-data/localazy-data';

export const useLocalazyConfigStore = defineStore(
  'localazyConfig',
  createSingletonStore<LocalazyData>(LOCALAZY_COLLECTIONS.config, defaultConfiguration().localazy_data),
);
