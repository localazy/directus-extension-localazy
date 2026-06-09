import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = resolve(fileURLToPath(import.meta.url), '..');

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'common',
          root: resolve(root, 'packages/common'),
          include: ['src/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'module',
          root: resolve(root, 'packages/module'),
          include: ['src/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'sync-hook',
          root: resolve(root, 'packages/sync-hook'),
          include: ['src/**/*.test.ts'],
          environment: 'node',
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['packages/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts', 'packages/common/src/config/**', 'packages/*/dist/**'],
    },
  },
});
