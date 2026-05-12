import { describe, it, expect } from 'vitest';
import { LocalazyPaymentStatus } from './localazy-payment-status';
import type { Project } from '@localazy/api-client';

function makeProject(overrides: Partial<Project['organization']> = {}): Project {
  return {
    organization: {
      usedKeys: 0,
      availableKeys: 100,
      figma: true,
      ...overrides,
    },
  } as unknown as Project;
}

describe('LocalazyPaymentStatus', () => {
  describe('isOverKeysLimit', () => {
    it('returns false when no organization is attached to the project', () => {
      expect(LocalazyPaymentStatus.isOverKeysLimit(null)).toBe(false);
      expect(LocalazyPaymentStatus.isOverKeysLimit({ organization: undefined } as unknown as Project)).toBe(false);
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
    it('returns false when no organization is attached', () => {
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
    it('returns true if either over-limit or no plugin access', () => {
      expect(LocalazyPaymentStatus.shouldDisableSyncOperations(makeProject({ usedKeys: 200, availableKeys: 100 }))).toBe(true);
      expect(LocalazyPaymentStatus.shouldDisableSyncOperations(makeProject({ figma: false }))).toBe(true);
    });

    it('returns false for an in-good-standing project', () => {
      expect(LocalazyPaymentStatus.shouldDisableSyncOperations(makeProject({ usedKeys: 1, availableKeys: 100, figma: true }))).toBe(false);
    });
  });
});
