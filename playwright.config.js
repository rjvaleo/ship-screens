import { defineConfig } from '@playwright/test';

// End-to-end tests run against the Vite dev server (which also serves the
// /api/presets endpoints). Headless by default so results come back as logs.
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:8000',
    headless: true,
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev',
    port: 8000,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
