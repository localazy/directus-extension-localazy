import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['extensions/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'development/**'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['extensions/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts', 'extensions/common/config/**', 'extensions/*/dist/**'],
    },
  },
});
