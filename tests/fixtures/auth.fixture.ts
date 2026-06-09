/**
 * Authentication Test Fixtures
 *
 * Provides helper methods for simulating authenticated state in tests.
 * Uses the test-login endpoint to bypass MindAuth OAuth flow in testing.
 */

import { test as base, Page, BrowserContext, Cookie } from '@playwright/test';

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
  const response = await context.request.post('http://localhost:4000/api/auth/test-login', {
    data: { userType },
  });

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`Failed to create test session: ${response.status()} - ${body}`);
  }

  // Extract the session cookie from the response
  const cookies = await context.cookies('http://localhost:4000');
  const sessionCookie = cookies.find(c => c.name === 'forum_session');

  if (!sessionCookie) {
    throw new Error('No forum_session cookie received from test-login endpoint');
  }
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
