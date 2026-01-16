import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['extensions/**/__tests__/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['extensions/common/**/*.ts', 'extensions/sync-hook/src/**/*.ts'],
      exclude: [
        '**/node_modules/**',
        '**/__tests__/**',
        '**/dist/**',
        '**/*.d.ts',
      ],
    },
    setupFiles: ['./extensions/common/__tests__/setup.ts'],
  },
  resolve: {
    alias: {
      '@common': path.resolve(__dirname, './extensions/common'),
      '@module': path.resolve(__dirname, './extensions/module/src'),
      '@sync-hook': path.resolve(__dirname, './extensions/sync-hook/src'),
    },
  },
});
