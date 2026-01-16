/**
 * Mock implementation of DirectusApi interface for testing
 */
import { vi } from 'vitest';
import type { DirectusApi } from '../../interfaces/directus-api';

export const createMockDirectusApi = (): DirectusApi => ({
  fetchDirectusItems: vi.fn().mockResolvedValue([]),
  createDirectusItem: vi.fn().mockResolvedValue({}),
  updateDirectusItem: vi.fn().mockResolvedValue({}),
  fetchSettings: vi.fn().mockResolvedValue(null),
  saveSettings: vi.fn().mockResolvedValue({}),
  fetchContentTransferSetup: vi.fn().mockResolvedValue(null),
  saveContentTransferSetup: vi.fn().mockResolvedValue({}),
  fetchLocalazyData: vi.fn().mockResolvedValue(null),
  saveLocalazyData: vi.fn().mockResolvedValue({}),
  fetchTranslationStrings: vi.fn().mockResolvedValue([]),
  upsertTranslationString: vi.fn().mockResolvedValue({}),
});

export const createMockSettings = (overrides = {}) => ({
  language_collection: 'languages',
  language_code_field: 'code',
  source_language: 'en',
  localazy_oauth_response: '',
  import_source_language: false,
  upload_existing_translations: false,
  automated_upload: true,
  automated_deprecation: true,
  skip_empty_strings: true,
  create_missing_languages_in_directus: 1,
  language_mappings: '[]',
  ...overrides,
});

export const createMockLocalazyData = (overrides = {}) => ({
  access_token: 'test-token',
  user_id: 'user-123',
  user_name: 'Test User',
  project_id: 'project-123',
  project_url: 'https://localazy.com/p/test',
  project_name: 'Test Project',
  org_id: 'org-123',
  ...overrides,
});
