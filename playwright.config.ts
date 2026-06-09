import { defineConfig, devices } from '@playwright/test';

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
    baseURL: 'http://localhost:3000',
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

  // Web servers are already running, no need to start them
  // webServer: [
  //   {
  //     command: 'npm run dev',
  //     cwd: '.',
  //     url: 'http://localhost:4000/api/health',
  //     reuseExistingServer: true,
  //     timeout: 120000,
  //   },
  //   {
  //     command: 'npm run dev',
  //     cwd: './frontend',
  //     url: 'http://localhost:3000',
  //     reuseExistingServer: true,
  //     timeout: 120000,
  //   },
  // ],

  // Test output directory
  outputDir: './test-results',
});