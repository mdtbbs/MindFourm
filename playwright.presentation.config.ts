import { defineConfig } from '@playwright/test';

/** Isolated browser presentation tests; no global DB teardown or real authentication. */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'rich-content.presentation.spec.ts',
  workers: 1,
  timeout: 120000,
  expect: { timeout: 20000 },
  use: {
    baseURL: 'http://127.0.0.1:4502',
    actionTimeout: 15000,
    launchOptions: process.env.PRESENTATION_CHROMIUM_PATH ? { executablePath: process.env.PRESENTATION_CHROMIUM_PATH } : {},
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  outputDir: 'test-results/presentation',
  webServer: [
    { command: 'node tests/helpers/presentation-api.cjs', url: 'http://127.0.0.1:4600/health', reuseExistingServer: false },
    { command: 'node node_modules/next/dist/bin/next dev -p 4502', cwd: './frontend', url: 'http://127.0.0.1:4502/posts/new', reuseExistingServer: false, timeout: 120000,
      env: { API_URL: 'http://127.0.0.1:4600', NEXT_PUBLIC_API_URL: 'http://127.0.0.1:4600', NEXT_PUBLIC_SITE_PROFILE: 'mdtbbs', NEXT_TELEMETRY_DISABLED: '1' } },
  ],
});
