import { describe, it, expect } from 'vitest';
import { LanguageMappingService } from './language-mapping-service';

describe('LanguageMappingService', () => {
  describe('construction + transform', () => {
    it('transforms via custom mapping when one is defined', () => {
      const service = new LanguageMappingService([{ directusCode: 'zh-Hans', localazyCode: 'zh-CN#Hans' }]);
      expect(service.transformDirectusToLocalazy('zh-Hans')).toBe('zh-CN#Hans');
      expect(service.transformLocalazyToDirectus('zh-CN#Hans')).toBe('zh-Hans');
    });

    it('falls back to default `-` ↔ `_` swap when no mapping exists', () => {
      const service = new LanguageMappingService([]);
      expect(service.transformDirectusToLocalazy('pt-BR')).toBe('pt_BR');
      expect(service.transformLocalazyToDirectus('pt_BR')).toBe('pt-BR');
    });

    it('accepts a JSON string as input', () => {
      const service = new LanguageMappingService('[{"directusCode":"zh-Hans","localazyCode":"zh-CN#Hans"}]');
      expect(service.transformDirectusToLocalazy('zh-Hans')).toBe('zh-CN#Hans');
    });

    it('tolerates malformed JSON without throwing', () => {
      const service = new LanguageMappingService('not-json');
      expect(service.transformDirectusToLocalazy('pt-BR')).toBe('pt_BR');
    });

    it('treats empty string as empty mappings array', () => {
      const service = new LanguageMappingService('');
      expect(service.transformDirectusToLocalazy('en-US')).toBe('en_US');
    });

    it('skips entries missing either code', () => {
      const service = new LanguageMappingService([
        { directusCode: 'zh-Hans', localazyCode: '' },
        { directusCode: '', localazyCode: 'zh-CN#Hans' },
        { directusCode: 'pt-BR', localazyCode: 'pt_BR_custom' },
      ]);
      expect(service.transformDirectusToLocalazy('zh-Hans')).toBe('zh_Hans');
      expect(service.transformDirectusToLocalazy('pt-BR')).toBe('pt_BR_custom');
    });
  });

  describe('hasCustomMapping', () => {
    it('returns true for codes mapped in either direction', () => {
      const service = new LanguageMappingService([{ directusCode: 'zh-Hans', localazyCode: 'zh-CN#Hans' }]);
      expect(service.hasCustomMapping('zh-Hans')).toBe(true);
      expect(service.hasCustomMapping('zh-CN#Hans')).toBe(true);
      expect(service.hasCustomMapping('en-US')).toBe(false);
    });
  });

  describe('getAllMappings', () => {
    it('returns all configured mappings', () => {
      const service = new LanguageMappingService([
        { directusCode: 'zh-Hans', localazyCode: 'zh-CN#Hans' },
        { directusCode: 'pt-BR', localazyCode: 'pt_BR_custom' },
      ]);
      const mappings = service.getAllMappings();
      expect(mappings).toHaveLength(2);
      expect(mappings).toContainEqual({ directusCode: 'zh-Hans', localazyCode: 'zh-CN#Hans' });
      expect(mappings).toContainEqual({ directusCode: 'pt-BR', localazyCode: 'pt_BR_custom' });
    });
  });

  describe('validateMappings (static)', () => {
    it('flags a JSON object that is not an array', () => {
      const { valid, errors } = LanguageMappingService.validateMappings('{}');
      expect(valid).toBe(false);
      expect(errors).toContain('Mappings must be an array');
    });

    it('flags missing or empty codes', () => {
      const { valid, errors } = LanguageMappingService.validateMappings(
        JSON.stringify([{ directusCode: '', localazyCode: 'x' }, { directusCode: 'y' }]),
      );
      expect(valid).toBe(false);
      expect(errors).toContain('Mapping 1: Directus code cannot be empty');
      expect(errors).toContain('Mapping 2: Missing or invalid Localazy code');
    });

    it('flags duplicates on either side', () => {
      const { valid, errors } = LanguageMappingService.validateMappings(
        JSON.stringify([
          { directusCode: 'zh-Hans', localazyCode: 'zh-CN#Hans' },
          { directusCode: 'zh-Hans', localazyCode: 'other' },
          { directusCode: 'pt-BR', localazyCode: 'zh-CN#Hans' },
        ]),
      );
      expect(valid).toBe(false);
      expect(errors.some((e) => e.includes('Duplicate Directus code "zh-Hans"'))).toBe(true);
      expect(errors.some((e) => e.includes('Duplicate Localazy code "zh-CN#Hans"'))).toBe(true);
    });

    it('flags malformed JSON', () => {
      const { valid, errors } = LanguageMappingService.validateMappings('{not json');
      expect(valid).toBe(false);
      expect(errors).toContain('Invalid JSON format');
    });

    it('accepts a valid mappings array', () => {
      const { valid, errors } = LanguageMappingService.validateMappings(
        JSON.stringify([{ directusCode: 'zh-Hans', localazyCode: 'zh-CN#Hans' }]),
      );
      expect(valid).toBe(true);
      expect(errors).toEqual([]);
    });

    it('accepts an empty input', () => {
      expect(LanguageMappingService.validateMappings('')).toEqual({ valid: true, errors: [] });
      expect(LanguageMappingService.validateMappings('[]')).toEqual({ valid: true, errors: [] });
    });
  });
});
