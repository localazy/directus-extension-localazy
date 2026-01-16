import { describe, it, expect, beforeEach } from 'vitest';
import { LanguageMappingService } from '../../services/language-mapping-service';

describe('LanguageMappingService', () => {
  describe('constructor and loadMappings', () => {
    it('should initialize with empty mappings when given empty JSON', () => {
      const service = new LanguageMappingService('[]');
      expect(service.getAllMappings()).toEqual([]);
    });

    it('should initialize with empty mappings when given null/undefined', () => {
      const service = new LanguageMappingService('');
      expect(service.getAllMappings()).toEqual([]);
    });

    it('should load valid mappings correctly', () => {
      const mappings = JSON.stringify([
        { directusCode: 'zh-Hans', localazyCode: 'zh-CN#Hans' },
        { directusCode: 'pt-BR', localazyCode: 'pt_BR' },
      ]);
      const service = new LanguageMappingService(mappings);
      expect(service.getAllMappings()).toHaveLength(2);
    });

    it('should handle invalid JSON gracefully', () => {
      const service = new LanguageMappingService('invalid json');
      expect(service.getAllMappings()).toEqual([]);
    });

    it('should skip mappings with missing directusCode', () => {
      const mappings = JSON.stringify([
        { localazyCode: 'zh-CN#Hans' },
        { directusCode: 'pt-BR', localazyCode: 'pt_BR' },
      ]);
      const service = new LanguageMappingService(mappings);
      expect(service.getAllMappings()).toHaveLength(1);
    });

    it('should skip mappings with missing localazyCode', () => {
      const mappings = JSON.stringify([
        { directusCode: 'zh-Hans' },
        { directusCode: 'pt-BR', localazyCode: 'pt_BR' },
      ]);
      const service = new LanguageMappingService(mappings);
      expect(service.getAllMappings()).toHaveLength(1);
    });
  });

  describe('transformDirectusToLocalazy', () => {
    it('should use custom mapping when available', () => {
      const mappings = JSON.stringify([
        { directusCode: 'zh-Hans', localazyCode: 'zh-CN#Hans' },
      ]);
      const service = new LanguageMappingService(mappings);
      expect(service.transformDirectusToLocalazy('zh-Hans')).toBe('zh-CN#Hans');
    });

    it('should fall back to default transformation when no custom mapping', () => {
      const service = new LanguageMappingService('[]');
      expect(service.transformDirectusToLocalazy('en-US')).toBe('en_US');
    });

    it('should handle languages without region separator', () => {
      const service = new LanguageMappingService('[]');
      expect(service.transformDirectusToLocalazy('en')).toBe('en');
    });

    it('should only replace first hyphen in complex codes', () => {
      const service = new LanguageMappingService('[]');
      expect(service.transformDirectusToLocalazy('zh-Hans-CN')).toBe('zh_Hans-CN');
    });
  });

  describe('transformLocalazyToDirectus', () => {
    it('should use custom mapping when available', () => {
      const mappings = JSON.stringify([
        { directusCode: 'zh-Hans', localazyCode: 'zh-CN#Hans' },
      ]);
      const service = new LanguageMappingService(mappings);
      expect(service.transformLocalazyToDirectus('zh-CN#Hans')).toBe('zh-Hans');
    });

    it('should fall back to default transformation when no custom mapping', () => {
      const service = new LanguageMappingService('[]');
      expect(service.transformLocalazyToDirectus('en_US')).toBe('en-US');
    });

    it('should handle languages without region separator', () => {
      const service = new LanguageMappingService('[]');
      expect(service.transformLocalazyToDirectus('en')).toBe('en');
    });
  });

  describe('bidirectional mapping consistency', () => {
    it('should maintain consistency when transforming back and forth with custom mappings', () => {
      const mappings = JSON.stringify([
        { directusCode: 'zh-Hans', localazyCode: 'zh-CN#Hans' },
        { directusCode: 'pt-BR', localazyCode: 'pt_BR' },
      ]);
      const service = new LanguageMappingService(mappings);

      // Directus -> Localazy -> Directus
      const localazyCode = service.transformDirectusToLocalazy('zh-Hans');
      expect(service.transformLocalazyToDirectus(localazyCode)).toBe('zh-Hans');

      // Localazy -> Directus -> Localazy
      const directusCode = service.transformLocalazyToDirectus('zh-CN#Hans');
      expect(service.transformDirectusToLocalazy(directusCode)).toBe('zh-CN#Hans');
    });

    it('should maintain consistency with default transformations', () => {
      const service = new LanguageMappingService('[]');

      // Standard language codes should round-trip correctly
      const localazyCode = service.transformDirectusToLocalazy('en-US');
      expect(service.transformLocalazyToDirectus(localazyCode)).toBe('en-US');
    });
  });

  describe('hasCustomMapping', () => {
    it('should return true for Directus code with custom mapping', () => {
      const mappings = JSON.stringify([
        { directusCode: 'zh-Hans', localazyCode: 'zh-CN#Hans' },
      ]);
      const service = new LanguageMappingService(mappings);
      expect(service.hasCustomMapping('zh-Hans')).toBe(true);
    });

    it('should return true for Localazy code with custom mapping', () => {
      const mappings = JSON.stringify([
        { directusCode: 'zh-Hans', localazyCode: 'zh-CN#Hans' },
      ]);
      const service = new LanguageMappingService(mappings);
      expect(service.hasCustomMapping('zh-CN#Hans')).toBe(true);
    });

    it('should return false for codes without custom mapping', () => {
      const mappings = JSON.stringify([
        { directusCode: 'zh-Hans', localazyCode: 'zh-CN#Hans' },
      ]);
      const service = new LanguageMappingService(mappings);
      expect(service.hasCustomMapping('en-US')).toBe(false);
    });

    it('should return false when no mappings are configured', () => {
      const service = new LanguageMappingService('[]');
      expect(service.hasCustomMapping('en-US')).toBe(false);
    });
  });

  describe('getDirectusMapping', () => {
    it('should return localazy code for existing directus mapping', () => {
      const mappings = JSON.stringify([
        { directusCode: 'zh-Hans', localazyCode: 'zh-CN#Hans' },
      ]);
      const service = new LanguageMappingService(mappings);
      expect(service.getDirectusMapping('zh-Hans')).toBe('zh-CN#Hans');
    });

    it('should return undefined for non-existent mapping', () => {
      const service = new LanguageMappingService('[]');
      expect(service.getDirectusMapping('en-US')).toBeUndefined();
    });
  });

  describe('getLocalazyMapping', () => {
    it('should return directus code for existing localazy mapping', () => {
      const mappings = JSON.stringify([
        { directusCode: 'zh-Hans', localazyCode: 'zh-CN#Hans' },
      ]);
      const service = new LanguageMappingService(mappings);
      expect(service.getLocalazyMapping('zh-CN#Hans')).toBe('zh-Hans');
    });

    it('should return undefined for non-existent mapping', () => {
      const service = new LanguageMappingService('[]');
      expect(service.getLocalazyMapping('en_US')).toBeUndefined();
    });
  });

  describe('validateMappings (static)', () => {
    it('should return valid for empty array', () => {
      const result = LanguageMappingService.validateMappings('[]');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return valid for correct mappings', () => {
      const mappings = JSON.stringify([
        { directusCode: 'zh-Hans', localazyCode: 'zh-CN#Hans' },
        { directusCode: 'pt-BR', localazyCode: 'pt_BR' },
      ]);
      const result = LanguageMappingService.validateMappings(mappings);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing directusCode', () => {
      const mappings = JSON.stringify([{ localazyCode: 'zh-CN#Hans' }]);
      const result = LanguageMappingService.validateMappings(mappings);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Mapping 1: Missing or invalid Directus code');
    });

    it('should detect missing localazyCode', () => {
      const mappings = JSON.stringify([{ directusCode: 'zh-Hans' }]);
      const result = LanguageMappingService.validateMappings(mappings);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Mapping 1: Missing or invalid Localazy code');
    });

    it('should detect empty directusCode', () => {
      const mappings = JSON.stringify([
        { directusCode: '', localazyCode: 'zh-CN#Hans' },
      ]);
      const result = LanguageMappingService.validateMappings(mappings);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Mapping 1: Directus code cannot be empty');
    });

    it('should detect empty localazyCode', () => {
      const mappings = JSON.stringify([
        { directusCode: 'zh-Hans', localazyCode: '   ' },
      ]);
      const result = LanguageMappingService.validateMappings(mappings);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Mapping 1: Localazy code cannot be empty');
    });

    it('should detect duplicate directusCodes', () => {
      const mappings = JSON.stringify([
        { directusCode: 'zh-Hans', localazyCode: 'zh-CN#Hans' },
        { directusCode: 'zh-Hans', localazyCode: 'zh_Hans' },
      ]);
      const result = LanguageMappingService.validateMappings(mappings);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Mapping 2: Duplicate Directus code "zh-Hans"');
    });

    it('should detect duplicate localazyCodes', () => {
      const mappings = JSON.stringify([
        { directusCode: 'zh-Hans', localazyCode: 'zh-CN#Hans' },
        { directusCode: 'zh-Hant', localazyCode: 'zh-CN#Hans' },
      ]);
      const result = LanguageMappingService.validateMappings(mappings);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Mapping 2: Duplicate Localazy code "zh-CN#Hans"');
    });

    it('should detect invalid JSON', () => {
      const result = LanguageMappingService.validateMappings('not valid json');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid JSON format');
    });

    it('should detect non-array JSON', () => {
      const result = LanguageMappingService.validateMappings('{"key": "value"}');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Mappings must be an array');
    });

    it('should report multiple errors in one validation', () => {
      const mappings = JSON.stringify([
        { directusCode: '', localazyCode: '' },
        { directusCode: 'zh-Hans' },
      ]);
      const result = LanguageMappingService.validateMappings(mappings);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(2);
    });
  });

  describe('getAllMappings', () => {
    it('should return all configured mappings', () => {
      const mappings = JSON.stringify([
        { directusCode: 'zh-Hans', localazyCode: 'zh-CN#Hans' },
        { directusCode: 'pt-BR', localazyCode: 'pt_BR' },
      ]);
      const service = new LanguageMappingService(mappings);
      const allMappings = service.getAllMappings();
      expect(allMappings).toHaveLength(2);
      expect(allMappings[0]).toEqual({
        directusCode: 'zh-Hans',
        localazyCode: 'zh-CN#Hans',
      });
    });

    it('should return empty array when no mappings', () => {
      const service = new LanguageMappingService('[]');
      expect(service.getAllMappings()).toEqual([]);
    });
  });
});
