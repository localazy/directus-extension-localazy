import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'development/**'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['packages/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts', 'packages/common/config/**', 'packages/*/dist/**'],
    },
  },
});
