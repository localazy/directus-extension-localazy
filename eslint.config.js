import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import vue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.turbo/**',
      'development/**',
      'packages/common/src/config/config.json',
      'scripts/**',
      'packages/*/scripts/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],

  // Type-aware linting (lets rules like no-floating-promises and no-misused-promises work).
  // projectService auto-discovers the relevant tsconfig per file.
  {
    files: ['**/*.ts', '**/*.vue'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        sourceType: 'module',
        ecmaVersion: 'latest',
        extraFileExtensions: ['.vue'],
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Module + common code runs in the admin browser context.
  {
    files: ['packages/module/**/*.{ts,vue}', 'packages/common/**/*.ts'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },

  // Hook code runs in the Directus Node process.
  {
    files: ['packages/sync-hook/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  {
    rules: {
      'no-warning-comments': ['warn', { terms: ['WIP'] }],
      'no-debugger': 'warn',
      'no-useless-assignment': 'warn',

      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],

      'vue/multi-word-component-names': 'off',
      'vue/max-len': ['error', { code: 140 }],
      'vue/no-template-target-blank': 'off',
    },
  },

  // Type-aware Promise-safety rule. Catches the bug class that produced the
  // missing-await in sync-hook/src/hook/index.ts. The baseline of intentional
  // fire-and-forget patterns (Vue setup() top-level hydrations, analytics
  // calls, etc.) has been triaged — each site is either awaited or prefixed
  // with `void`. Set to 'error' so a new floating Promise blocks CI.
  // no-misused-promises is intentionally off: it produces false positives
  // against Directus' action() callback signature, which accepts async fns.
  {
    files: ['**/*.ts', '**/*.vue'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },

  prettierConfig,
);
