/**
 * Global test setup for Vitest
 */
import { vi } from 'vitest';

// Mock console.error to prevent noise in tests (can be re-enabled per test)
vi.spyOn(console, 'error').mockImplementation(() => {});

// Reset all mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});
