/**
 * Mock data and helpers for Localazy API responses
 */
import { vi } from 'vitest';

export const createMockLocalazyProject = (overrides = {}) => ({
  id: 'project-123',
  name: 'Test Project',
  slug: 'test-project',
  sourceLanguage: 1033, // en-US locale ID
  languages: [
    { code: 'en', name: 'English', enabled: true },
    { code: 'es', name: 'Spanish', enabled: true },
    { code: 'fr', name: 'French', enabled: true },
    { code: 'zh_Hans', name: 'Chinese Simplified', enabled: true },
  ],
  ...overrides,
});

export const createMockLocalazyFile = (overrides = {}) => ({
  id: 'file-123',
  name: 'directus.json',
  type: 'json',
  ...overrides,
});

export const createMockLocalazyKey = (overrides = {}) => ({
  id: 'key-123',
  key: ['articles', '1', 'title'],
  value: 'Test Title',
  ...overrides,
});

export const createMockLocalazyKeys = (count = 5) =>
  Array.from({ length: count }, (_, i) => ({
    id: `key-${i}`,
    key: ['collection', `${i}`, 'field'],
    value: `Value ${i}`,
  }));

export const createMockLocalazyLanguage = (overrides = {}) => ({
  localazyId: 1033,
  locale: 'en',
  name: 'English',
  ...overrides,
});

// Mock the @localazy/languages module
export const mockLocalazyLanguages = () => {
  const languages = [
    { localazyId: 1033, locale: 'en', name: 'English' },
    { localazyId: 1034, locale: 'es', name: 'Spanish' },
    { localazyId: 1036, locale: 'fr', name: 'French' },
    { localazyId: 2052, locale: 'zh_Hans', name: 'Chinese Simplified' },
    { localazyId: 1028, locale: 'zh_Hant', name: 'Chinese Traditional' },
    { localazyId: 1031, locale: 'de', name: 'German' },
    { localazyId: 1041, locale: 'ja', name: 'Japanese' },
  ];

  return {
    getLocalazyLanguages: vi.fn().mockReturnValue(languages),
    findLocalazyLanguageByLocale: vi.fn((locale: string) =>
      languages.find((l) => l.locale === locale)
    ),
  };
};
