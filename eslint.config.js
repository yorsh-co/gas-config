import { gasEslint } from 'gas-dev-config/eslint';
import globals from 'globals';

export default gasEslint(
  {
    ignores: ['.manual-config/**'],
    web: {
      files: ['src/web/**/*.ts'],
      tsconfig: './tsconfig.frontend.json',
    },
  },
  // Development harness and mock server — classic browser scripts sharing one
  // global scope, as the UI does once inlined into an HtmlService document.
  {
    files: ['dev/**/*.js'],
    ignores: ['dev/serve.js'],
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
  // Development server — Node ESM.
  {
    files: ['dev/serve.js'],
    languageOptions: { sourceType: 'module', globals: globals.node },
  },
  // Playwright config and end-to-end tests — ES modules running on Node, with
  // page code that touches browser globals inside `page.evaluate`.
  {
    files: ['playwright.config.ts', 'e2e/**/*.ts'],
    languageOptions: {
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
  },
  // The manual fixture is a global-scope Apps Script file that uses the
  // library's globals, like a consumer's code.
  {
    files: ['manual/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        console: 'readonly',
        PropertiesService: 'readonly',
        SpreadsheetApp: 'readonly',
        DocumentApp: 'readonly',
        SlidesApp: 'readonly',
        FormApp: 'readonly',
        GasConfig: 'readonly',
        GasLogger: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  // app.js calls getUi_() and getContainerName_(), which the host file in
  // manual/hosts/ defines.
  {
    files: ['manual/app.js'],
    languageOptions: {
      globals: { getUi_: 'readonly', getContainerName_: 'readonly' },
    },
  },
);
