// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e/specs',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'test-results/html' }]],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'node src/index.js',
      url: 'http://localhost:4000/api/health',
      reuseExistingServer: true,
      cwd: __dirname,
    },
    {
      command: 'npx next dev -p 3000',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      cwd: __dirname + '/frontend',
    },
  ],
});
