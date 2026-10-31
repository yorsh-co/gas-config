import { defineConfig } from '@playwright/test';

const PORT = Number(process.env['PORT'] ?? 5174);
const executablePath = process.env['PLAYWRIGHT_CHROMIUM_EXECUTABLE'];

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    ...(executablePath && { launchOptions: { executablePath } }),
  },
  webServer: {
    command: 'node dev/serve.js',
    url: `http://127.0.0.1:${PORT}/dev/index.html`,
    env: { PORT: String(PORT) },
    reuseExistingServer: !process.env['CI'],
  },
});
