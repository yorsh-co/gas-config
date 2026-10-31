import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Playwright owns `e2e/`; `npm run test:e2e` runs it.
    include: ['test/**/*.test.ts'],
  },
});
