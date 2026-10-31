import { gasEslint } from 'gas-dev-config/eslint';
import globals from 'globals';

export default gasEslint(
  {},
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
);
