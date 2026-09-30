import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['vendor/**', 'dist/**', 'node_modules/**', 'artifacts/**', 'test-results/**', 'playwright-report/**', 'ue5/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js', 'sw.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.browser } },
  },
  {
    files: ['scripts/**/*.mjs', 'tests/**/*.js', '*.config.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.node, ...globals.browser } },
  },
  {
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
];
