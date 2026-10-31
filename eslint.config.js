import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/**', '.worktrees/**'] },

  eslint.configs.recommended,
  ...tseslint.configs.recommended,

  // Backend GAS files
  {
    files: ['**/*.ts'],
    languageOptions: {
      sourceType: 'script', // no import/export — GAS files share one global scope
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    rules: {
      // tsc already checks this against the google-apps-script ambient types;
      // ESLint's no-undef doesn't see ambient .d.ts globals and will false-positive
      // on SpreadsheetApp, Logger, console, etc.
      // 'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },

  // Node.js build scripts — ESM, full Node globals, no TS project linting.
  {
    files: ['scripts/**/*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: globals.node,
    },
  },

  // UI prototype — classic browser scripts sharing one global scope, as they
  // will once inlined into a single HtmlService document.
  {
    files: ['prototype/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        ...globals.browser,
        google: 'writable',
        GasConfigValidation: 'writable',
      },
    },
    rules: {
      'no-redeclare': ['error', { builtinGlobals: false }],
      '@typescript-eslint/no-unused-vars': ['error', { vars: 'local' }],
    },
  },

  eslintConfigPrettier,
);
