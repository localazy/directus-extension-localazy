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
    'no-warning-comments': ['warn', { terms: ['WIP'] }],
    'import/no-extraneous-dependencies': 0,
    'vue/multi-word-component-names': 0,
    'vue/max-len': ['error', { code: 140 }],
    'import/prefer-default-export': 0,
    'no-debugger': 'warn',
    'no-shadow': 'off',
    camelcase: 'off',
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': 'warn',
    semi: 'off',
    '@typescript-eslint/semi': ['error'],
    '@typescript-eslint/no-shadow': ['error'],
    '@typescript-eslint/no-explicit-any': 'off',

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
};
