import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import vue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', 'development/**', 'extensions/common/config/config.json', 'scripts/**'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],

  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        sourceType: 'module',
        ecmaVersion: 'latest',
        extraFileExtensions: ['.vue'],
      },
    },
  },

  // Module + common code runs in the admin browser context.
  {
    files: ['extensions/module/**/*.{ts,vue}', 'extensions/common/**/*.ts'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },

  // Hook code runs in the Directus Node process.
  {
    files: ['extensions/sync-hook/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  {
    rules: {
      'no-warning-comments': ['warn', { terms: ['WIP'] }],
      'no-debugger': 'warn',
      'no-useless-assignment': 'warn',

      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],

      'vue/multi-word-component-names': 'off',
      'vue/max-len': ['error', { code: 140 }],
      'vue/no-template-target-blank': 'off',
    },
  },

  prettierConfig,
);
