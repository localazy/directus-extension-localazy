import { defineStore } from 'pinia';
import { createSingletonStore } from '../composables/use-localazy-singleton';
import { LOCALAZY_COLLECTIONS } from './localazy-installer-store';
import { defaultConfiguration } from '../data/default-configuration';
import type { Settings } from '../../../common/models/collections-data/settings';

export const useLocalazySettingsStore = defineStore(
  'localazySettings',
  createSingletonStore<Settings>(LOCALAZY_COLLECTIONS.settings, defaultConfiguration().settings),
);
