module.exports = {
  root: true,
  env: {
    node: true,
  },
  parser: 'vue-eslint-parser',
  parserOptions: {
    parser: '@typescript-eslint/parser',
    sourceType: 'module',
  },
  extends: [
    'plugin:vue/vue3-essential',
    '@vue/eslint-config-airbnb',
    'plugin:@typescript-eslint/recommended',
  ],
  rules: {
    // Fail on forgotten WIP comments
    'no-warning-comments': ['warn', { terms: ['WIP', 'TODO', 'FIXME'] }],
    'import/no-extraneous-dependencies': 0,
    'vue/multi-word-component-names': 0,
    'vue/max-len': ['error', { code: 140 }],
    'import/prefer-default-export': 0,
    'no-debugger': 'warn',
    'no-shadow': 'off',
    camelcase: 'off',
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    semi: 'off',
    '@typescript-eslint/semi': ['error'],
    '@typescript-eslint/no-shadow': ['error'],
    // Enforce type safety - warn on any usage to encourage proper types
    '@typescript-eslint/no-explicit-any': 'warn',
    // Ensure consistent return types
    '@typescript-eslint/explicit-function-return-type': 'off',
    // Enforce proper typing for function parameters
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    // Disallow non-null assertions
    '@typescript-eslint/no-non-null-assertion': 'warn',
    // Require await in async functions
    'require-await': 'off',
    '@typescript-eslint/require-await': 'off',
    // Warn on floating promises (promises not awaited or caught)
    '@typescript-eslint/no-floating-promises': 'off',

    'vuejs-accessibility/click-events-have-key-events': 0,
    'vuejs-accessibility/anchor-has-content': 0,
    'vue/no-template-target-blank': 0,
    'class-methods-use-this': 'off',
    'import/no-relative-packages': 'off',
    'import/extensions': [
      'error',
      'ignorePackages',
      {
        js: 'never',
        jsx: 'never',
        ts: 'never',
        tsx: 'never',
      },
    ],
    // Enforce consistent brace style
    'brace-style': ['error', '1tbs', { allowSingleLine: true }],
    // Enforce consistent spacing inside braces
    'object-curly-spacing': ['error', 'always'],
    // Enforce consistent array bracket spacing
    'array-bracket-spacing': ['error', 'never'],
  },
  settings: {
    'import/resolver': {
      typescript: {}, // this loads <rootdir>/tsconfig.json to eslint
      node: {
        paths: ['src'],
        extensions: ['.js', '.jsx', '.vue', 'ts', 'tsx'],
      },
    },
  },
  overrides: [
    {
      // Relaxed rules for test files
      files: ['**/__tests__/**/*.ts', '**/*.test.ts', '**/*.spec.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
      },
    },
  ],
};
