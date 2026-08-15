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

async function routeBrowserApiToTestServer(context: BrowserContext): Promise<void> {
  const target = new URL(API_URL);
  await context.route('**/api/**', async (route) => {
    const requested = new URL(route.request().url());
    if (requested.origin === target.origin) {
      await route.continue();
      return;
    }

    requested.protocol = target.protocol;
    requested.host = target.host;
    await route.continue({ url: requested.toString() });
  });
}

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
  // Mark as an option so suites can explicitly request an admin/moderator
  // session with `test.use(...)`; ordinary fixtures are not overrideable this
  // way and silently retained the default user role.
  testUserType: ['user', { option: true }],

  authenticatedPage: async ({ browser, testUserType }, use) => {
    // Create a new browser context for this test
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await routeBrowserApiToTestServer(context);
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

// A dedicated staff fixture creates its own session rather than overriding an
// already-resolved dependent fixture. This keeps administrative E2E cases from
// silently falling back to a normal user session.
export const adminTest = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await routeBrowserApiToTestServer(context);
      await createTestSession(context, 'admin');
      await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await use(page);
    } finally {
      await context.close().catch(() => {});
    }
  },
});

export { expect } from '@playwright/test';
export { TEST_USERS };
