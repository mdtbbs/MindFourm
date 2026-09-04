import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000';
const apiURL = process.env.PLAYWRIGHT_API_URL || 'http://127.0.0.1:4000';
const authURL = process.env.PLAYWRIGHT_AUTH_URL || 'http://127.0.0.1:4001';

process.env.PLAYWRIGHT_BASE_URL = baseURL;
process.env.PLAYWRIGHT_API_URL = apiURL;
process.env.PLAYWRIGHT_AUTH_URL = authURL;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  timeout: 120000, // 120 seconds per test (includes fixture setup + navigation)
  expect: {
    timeout: 10000,
  },
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
  ],

  use: {
    baseURL,
    trace: 'on-first-retry',
    video: 'on-failure',
    screenshot: 'on-failure',
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },

  projects: [
    // Desktop browsers
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    // Mobile browsers
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  // Web servers are started outside Playwright in local development.
  // Keep these URLs configurable so tests can target 127.0.0.1 to avoid
  // Windows localhost/IPv6 issues when needed.

  globalTeardown: './tests/e2e/global-teardown.ts',

  // Test output directory
  outputDir: './test-results',
});
