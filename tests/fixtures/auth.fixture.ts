/**
 * Authentication Test Fixtures
 *
 * Provides helper methods for simulating authenticated state in tests.
 * Uses the test-login endpoint to bypass MindAuth OAuth flow in testing.
 *
 * The API must be started with `ENABLE_TEST_AUTH=true` — the endpoint is not
 * registered otherwise (and is refused outright when NODE_ENV=production).
 */

import { test as base, Page, BrowserContext } from '@playwright/test';

const API_URL = process.env.PLAYWRIGHT_API_URL || 'http://127.0.0.1:4000';
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000';

// Test user configuration - maps to existing database users
const TEST_USERS = {
  admin: { id: 1, username: 'testuser', role: 'admin' },
  moderator: { id: 3, username: 'admin_mp2rq4te', role: 'admin' }, // Use admin as moderator for tests
  user: { id: 2, username: 'e2e_mp2rq4te', role: 'user' },
};

type TestUserType = keyof typeof TEST_USERS;

type AuthFixtures = {
  authenticatedPage: Page;
  testUserType: TestUserType;
};

/**
 * Create an authenticated session by calling the test-login endpoint
 */
async function createTestSession(
  context: BrowserContext,
  userType: TestUserType = 'user'
): Promise<void> {
  // Call the test-login endpoint to get a session cookie
  const response = await context.request.post(`${API_URL}/api/auth/test-login`, {
    data: { userType },
  });

  if (!response.ok()) {
    if (response.status() === 404) {
      throw new Error(
        'test-login endpoint is not registered. Start the API with ENABLE_TEST_AUTH=true ' +
          '(it stays disabled when NODE_ENV=production).',
      );
    }
    const body = await response.text();
    throw new Error(`Failed to create test session: ${response.status()} - ${body}`);
  }

  // Extract the session cookie from the response
  const cookies = await context.cookies(API_URL);
  const sessionCookie = cookies.find(c => c.name === 'forum_session');

  if (!sessionCookie) {
    throw new Error('No forum_session cookie received from test-login endpoint');
  }

  await context.addCookies([
    {
      name: 'forum_session',
      value: sessionCookie.value,
      url: BASE_URL,
      httpOnly: true,
      sameSite: 'Lax',
      secure: false,
    },
  ]);
}

export const test = base.extend<AuthFixtures>({
  testUserType: 'user',

  authenticatedPage: async ({ browser, testUserType }, use) => {
    // Create a new browser context for this test
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      // Create authenticated session
      await createTestSession(context, testUserType);

      // Navigate to home and wait for domcontentloaded (faster than 'load')
      await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    } catch (error) {
      // If setup fails, clean up and rethrow
      await context.close().catch(() => {});
      throw error;
    }

    await use(page);

    // Cleanup
    await context.close().catch(() => {});
  },
});

export { expect } from '@playwright/test';
export { TEST_USERS };
