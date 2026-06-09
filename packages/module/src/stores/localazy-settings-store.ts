import { defineStore } from 'pinia';
import { createSingletonStore } from './singleton-factory';
import { LOCALAZY_COLLECTIONS } from './localazy-installer-store';
import { defaultConfiguration } from '../data/default-configuration';
import type { Settings } from '@localazy/directus-common';

export const useLocalazySettingsStore = defineStore(
  'localazySettings',
  createSingletonStore<Settings>(LOCALAZY_COLLECTIONS.settings, defaultConfiguration().settings),
);
