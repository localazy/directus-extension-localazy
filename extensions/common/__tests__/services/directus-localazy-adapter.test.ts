import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DirectusLocalazyAdapter } from '../../services/directus-localazy-adapter';

// Mock @localazy/languages module
vi.mock('@localazy/languages', () => ({
  getLocalazyLanguages: vi.fn(() => [
    { localazyId: 1033, locale: 'en', name: 'English' },
    { localazyId: 1034, locale: 'es', name: 'Spanish' },
    { localazyId: 1036, locale: 'fr', name: 'French' },
    { localazyId: 2052, locale: 'zh_Hans', name: 'Chinese Simplified' },
    { localazyId: 1028, locale: 'zh_Hant', name: 'Chinese Traditional' },
  ]),
}));

describe('DirectusLocalazyAdapter', () => {
  beforeEach(() => {
    // Clear any previous mappings before each test
    DirectusLocalazyAdapter.clearMappings();
  });

  describe('initializeMappings', () => {
    it('should initialize mappings from JSON string', () => {
      const mappings = JSON.stringify([
        { directusCode: 'zh-Hans', localazyCode: 'zh-CN#Hans' },
      ]);
      DirectusLocalazyAdapter.initializeMappings(mappings);
      expect(DirectusLocalazyAdapter.getMappingService()).not.toBeNull();
    });

    it('should handle empty JSON array', () => {
      DirectusLocalazyAdapter.initializeMappings('[]');
      expect(DirectusLocalazyAdapter.getMappingService()).not.toBeNull();
    });

    it('should handle invalid JSON gracefully', () => {
      DirectusLocalazyAdapter.initializeMappings('invalid');
      expect(DirectusLocalazyAdapter.getMappingService()).not.toBeNull();
    });
  });

  describe('getMappingService', () => {
    it('should return null before initialization', () => {
      expect(DirectusLocalazyAdapter.getMappingService()).toBeNull();
    });

    it('should return service instance after initialization', () => {
      DirectusLocalazyAdapter.initializeMappings('[]');
      expect(DirectusLocalazyAdapter.getMappingService()).not.toBeNull();
    });
  });

  describe('clearMappings', () => {
    it('should reset mapping service to null', () => {
      DirectusLocalazyAdapter.initializeMappings('[]');
      expect(DirectusLocalazyAdapter.getMappingService()).not.toBeNull();

      DirectusLocalazyAdapter.clearMappings();
      expect(DirectusLocalazyAdapter.getMappingService()).toBeNull();
    });
  });

  describe('transformDirectusToLocalazyLanguage', () => {
    it('should use custom mapping when initialized', () => {
      const mappings = JSON.stringify([
        { directusCode: 'zh-Hans', localazyCode: 'zh-CN#Hans' },
      ]);
      DirectusLocalazyAdapter.initializeMappings(mappings);

      expect(DirectusLocalazyAdapter.transformDirectusToLocalazyLanguage('zh-Hans'))
        .toBe('zh-CN#Hans');
    });

    it('should use default transformation when no custom mapping', () => {
      DirectusLocalazyAdapter.initializeMappings('[]');

      expect(DirectusLocalazyAdapter.transformDirectusToLocalazyLanguage('en-US'))
        .toBe('en_US');
    });

    it('should use default transformation when not initialized (backward compat)', () => {
      expect(DirectusLocalazyAdapter.transformDirectusToLocalazyLanguage('en-US'))
        .toBe('en_US');
    });

    it('should handle simple language codes without region', () => {
      expect(DirectusLocalazyAdapter.transformDirectusToLocalazyLanguage('en'))
        .toBe('en');
    });
  });

  describe('transformLocalazyToDirectusPreferedFormLanguage', () => {
    it('should use custom mapping when initialized', () => {
      const mappings = JSON.stringify([
        { directusCode: 'zh-Hans', localazyCode: 'zh-CN#Hans' },
      ]);
      DirectusLocalazyAdapter.initializeMappings(mappings);

      expect(DirectusLocalazyAdapter.transformLocalazyToDirectusPreferedFormLanguage('zh-CN#Hans'))
        .toBe('zh-Hans');
    });

    it('should use default transformation when no custom mapping', () => {
      DirectusLocalazyAdapter.initializeMappings('[]');

      expect(DirectusLocalazyAdapter.transformLocalazyToDirectusPreferedFormLanguage('en_US'))
        .toBe('en-US');
    });

    it('should use default transformation when not initialized (backward compat)', () => {
      expect(DirectusLocalazyAdapter.transformLocalazyToDirectusPreferedFormLanguage('en_US'))
        .toBe('en-US');
    });

    it('should handle simple language codes without region', () => {
      expect(DirectusLocalazyAdapter.transformLocalazyToDirectusPreferedFormLanguage('en'))
        .toBe('en');
    });
  });

  describe('hasCustomMapping', () => {
    it('should return false when not initialized', () => {
      expect(DirectusLocalazyAdapter.hasCustomMapping('zh-Hans')).toBe(false);
    });

    it('should return true for codes with custom mappings', () => {
      const mappings = JSON.stringify([
        { directusCode: 'zh-Hans', localazyCode: 'zh-CN#Hans' },
      ]);
      DirectusLocalazyAdapter.initializeMappings(mappings);

      expect(DirectusLocalazyAdapter.hasCustomMapping('zh-Hans')).toBe(true);
      expect(DirectusLocalazyAdapter.hasCustomMapping('zh-CN#Hans')).toBe(true);
    });

    it('should return false for codes without custom mappings', () => {
      DirectusLocalazyAdapter.initializeMappings('[]');

      expect(DirectusLocalazyAdapter.hasCustomMapping('en-US')).toBe(false);
    });
  });

  describe('mapDirectusToLocalazySourceLanguage', () => {
    it('should find language by Localazy ID', () => {
      const result = DirectusLocalazyAdapter.mapDirectusToLocalazySourceLanguage(
        1033, // English ID
        'en'
      );
      expect(result).toBe('en');
    });

    it('should return directus source language as fallback when ID not found', () => {
      const result = DirectusLocalazyAdapter.mapDirectusToLocalazySourceLanguage(
        99999, // Non-existent ID
        'custom-lang'
      );
      expect(result).toBe('custom-lang');
    });

    it('should return locale from Localazy languages list', () => {
      const result = DirectusLocalazyAdapter.mapDirectusToLocalazySourceLanguage(
        2052, // Chinese Simplified ID
        'zh-Hans'
      );
      expect(result).toBe('zh_Hans');
    });
  });

  describe('mapLocalazyToDirectusSourceLanguage', () => {
    it('should return directus source language when processed language matches localazy source', () => {
      const result = DirectusLocalazyAdapter.mapLocalazyToDirectusSourceLanguage(
        'en', // processed language
        1033, // localazy source language ID (en)
        'en' // directus source language
      );
      expect(result).toBe('en');
    });

    it('should return processed language when it does not match source', () => {
      const result = DirectusLocalazyAdapter.mapLocalazyToDirectusSourceLanguage(
        'es', // processed language (Spanish)
        1033, // localazy source language ID (English)
        'en' // directus source language
      );
      expect(result).toBe('es');
    });

    it('should handle non-existent language ID gracefully', () => {
      const result = DirectusLocalazyAdapter.mapLocalazyToDirectusSourceLanguage(
        'es',
        99999, // non-existent ID
        'en'
      );
      expect(result).toBe('es');
    });
  });

  describe('resolveLocalazyLanguageId', () => {
    it('should find language by ID', () => {
      const result = DirectusLocalazyAdapter.resolveLocalazyLanguageId(1033);
      expect(result).toEqual({
        localazyId: 1033,
        locale: 'en',
        name: 'English',
      });
    });

    it('should return undefined for non-existent ID', () => {
      const result = DirectusLocalazyAdapter.resolveLocalazyLanguageId(99999);
      expect(result).toBeUndefined();
    });
  });

  describe('integration: bidirectional consistency', () => {
    it('should maintain consistency with custom mappings', () => {
      const mappings = JSON.stringify([
        { directusCode: 'zh-Hans', localazyCode: 'zh-CN#Hans' },
        { directusCode: 'pt-BR', localazyCode: 'pt_BR' },
      ]);
      DirectusLocalazyAdapter.initializeMappings(mappings);

      // Test round-trip Directus -> Localazy -> Directus
      const localazy = DirectusLocalazyAdapter.transformDirectusToLocalazyLanguage('zh-Hans');
      const backToDirectus = DirectusLocalazyAdapter.transformLocalazyToDirectusPreferedFormLanguage(localazy);
      expect(backToDirectus).toBe('zh-Hans');

      // Test round-trip Localazy -> Directus -> Localazy
      const directus = DirectusLocalazyAdapter.transformLocalazyToDirectusPreferedFormLanguage('zh-CN#Hans');
      const backToLocalazy = DirectusLocalazyAdapter.transformDirectusToLocalazyLanguage(directus);
      expect(backToLocalazy).toBe('zh-CN#Hans');
    });

    it('should maintain consistency with default transformations', () => {
      DirectusLocalazyAdapter.initializeMappings('[]');

      const localazy = DirectusLocalazyAdapter.transformDirectusToLocalazyLanguage('en-US');
      const backToDirectus = DirectusLocalazyAdapter.transformLocalazyToDirectusPreferedFormLanguage(localazy);
      expect(backToDirectus).toBe('en-US');
    });
  });
});
