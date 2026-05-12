import { describe, it, expect, afterEach } from 'vitest';
import { DirectusLocalazyAdapter } from './directus-localazy-adapter';

describe('DirectusLocalazyAdapter — language mapping integration', () => {
  afterEach(() => {
    // Static state — leaks across tests if not reset.
    DirectusLocalazyAdapter.clearMappings();
  });

  it('falls back to default `-` ↔ `_` swap when no mappings are initialised', () => {
    expect(DirectusLocalazyAdapter.transformDirectusToLocalazyLanguage('pt-BR')).toBe('pt_BR');
    expect(DirectusLocalazyAdapter.transformLocalazyToDirectusPreferedFormLanguage('pt_BR')).toBe('pt-BR');
  });

  it('uses custom mappings once initialised', () => {
    DirectusLocalazyAdapter.initializeMappings([{ directusCode: 'zh-Hans', localazyCode: 'zh-CN#Hans' }]);
    expect(DirectusLocalazyAdapter.transformDirectusToLocalazyLanguage('zh-Hans')).toBe('zh-CN#Hans');
    expect(DirectusLocalazyAdapter.transformLocalazyToDirectusPreferedFormLanguage('zh-CN#Hans')).toBe('zh-Hans');
  });

  it('still falls back to default for unmapped codes after initialisation', () => {
    DirectusLocalazyAdapter.initializeMappings([{ directusCode: 'zh-Hans', localazyCode: 'zh-CN#Hans' }]);
    expect(DirectusLocalazyAdapter.transformDirectusToLocalazyLanguage('pt-BR')).toBe('pt_BR');
  });

  it('clearMappings restores fallback behaviour', () => {
    DirectusLocalazyAdapter.initializeMappings([{ directusCode: 'zh-Hans', localazyCode: 'zh-CN#Hans' }]);
    DirectusLocalazyAdapter.clearMappings();
    expect(DirectusLocalazyAdapter.transformDirectusToLocalazyLanguage('zh-Hans')).toBe('zh_Hans');
  });

  it('accepts JSON string input from settings', () => {
    DirectusLocalazyAdapter.initializeMappings('[{"directusCode":"zh-Hans","localazyCode":"zh-CN#Hans"}]');
    expect(DirectusLocalazyAdapter.transformDirectusToLocalazyLanguage('zh-Hans')).toBe('zh-CN#Hans');
  });
});
