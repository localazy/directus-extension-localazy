import { describe, it, expect } from 'vitest';
import type { Organization, Project } from '@localazy/api-client';
import { LocalazyPaymentStatus } from './localazy-payment-status';

function makeOrganization(overrides: Partial<Organization> = {}): Organization {
  return {
    availableKeys: 100,
    usedKeys: 0,
    figma: true,
    connectedApps: false,
    releaseTags: false,
    formatConversions: false,
    screenshots: false,
    screenshotsForFigma: false,
    additionalMt: false,
    mtPretranslate: false,
    webhooks: false,
    ...overrides,
  };
}

function makeProject(orgOverrides: Partial<Organization> = {}): Project {
  return {
    id: 'p1',
    orgId: 'org1',
    name: 'Test Project',
    slug: 'test',
    image: '',
    url: 'https://localazy.com/p/test',
    description: '',
    type: 'private',
    tone: 'formal',
    role: 'owner',
    sourceLanguage: 0,
    organization: makeOrganization(orgOverrides),
    languages: [],
  };
}

describe('LocalazyPaymentStatus', () => {
  describe('isOverKeysLimit', () => {
    it('returns false when the project is null', () => {
      expect(LocalazyPaymentStatus.isOverKeysLimit(null)).toBe(false);
    });

    it('returns false when used keys are below the available limit', () => {
      const project = makeProject({ usedKeys: 50, availableKeys: 100 });
      expect(LocalazyPaymentStatus.isOverKeysLimit(project)).toBe(false);
    });

    it('returns false at the exact limit (strict greater-than)', () => {
      const project = makeProject({ usedKeys: 100, availableKeys: 100 });
      expect(LocalazyPaymentStatus.isOverKeysLimit(project)).toBe(false);
    });

    it('returns true when used keys exceed the available limit', () => {
      const project = makeProject({ usedKeys: 101, availableKeys: 100 });
      expect(LocalazyPaymentStatus.isOverKeysLimit(project)).toBe(true);
    });
  });

  describe('lacksAccessToPlugin', () => {
    it('returns false when the project is null', () => {
      expect(LocalazyPaymentStatus.lacksAccessToPlugin(null)).toBe(false);
    });

    it('returns false when the organization has figma access', () => {
      expect(LocalazyPaymentStatus.lacksAccessToPlugin(makeProject({ figma: true }))).toBe(false);
    });

    it('returns true when the organization lacks figma access', () => {
      expect(LocalazyPaymentStatus.lacksAccessToPlugin(makeProject({ figma: false }))).toBe(true);
    });
  });

  describe('shouldDisableSyncOperations', () => {
    it('returns true when over the keys limit', () => {
      expect(LocalazyPaymentStatus.shouldDisableSyncOperations(makeProject({ usedKeys: 200, availableKeys: 100 }))).toBe(true);
    });

    it('returns true when the organization lacks plugin access', () => {
      expect(LocalazyPaymentStatus.shouldDisableSyncOperations(makeProject({ figma: false }))).toBe(true);
    });

    it('returns false for an in-good-standing project', () => {
      expect(LocalazyPaymentStatus.shouldDisableSyncOperations(makeProject({ usedKeys: 1, availableKeys: 100, figma: true }))).toBe(false);
    });
  });
});
