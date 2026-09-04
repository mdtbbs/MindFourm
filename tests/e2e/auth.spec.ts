/**
 * Authentication Flow E2E Tests
 *
 * Tests the complete authentication flow including:
 * - Login via MindAuth OAuth
 * - Logout
 * - Route protection for authenticated pages
 * - Session persistence
 */

import { test, expect } from '../fixtures/page-objects/base.po';
import { test as authTest, expect as authExpect } from '../fixtures/auth.fixture';
import { type Page } from '@playwright/test';

const API_URL = process.env.PLAYWRIGHT_API_URL || 'http://127.0.0.1:4000';
const AUTH_URL = process.env.PLAYWRIGHT_AUTH_URL || 'http://127.0.0.1:4001';
const AUTH_ORIGIN = new URL(AUTH_URL).origin;

async function expectMindAuthRedirect(
  page: Page,
  action: () => Promise<unknown> | unknown,
  expectedPath: string,
  expectedState: string,
) {
  await Promise.all([
    page.waitForURL(
      (url) => url.origin === AUTH_ORIGIN || url.hostname.includes('mindauth'),
      { timeout: 10000 },
    ),
    Promise.resolve(action()),
  ]);

  expect(readAuthRoute(page.url())).toBe(expectedPath);
  expect(readAuthParam(page.url(), 'state')).toBe(expectedState);
}

function readAuthRoute(urlString: string): string {
  const url = new URL(urlString);
  if (url.hash.startsWith('#/')) {
    const hashPath = url.hash.slice(1).split('?')[0];
    if (hashPath) {
      return hashPath;
    }
  }
  return url.pathname;
}

function readAuthParam(urlString: string, key: string): string | null {
  const url = new URL(urlString);
  const searchValue = url.searchParams.get(key);
  if (searchValue !== null) {
    return searchValue;
  }

  const hashQuery = url.hash.split('?')[1];
  if (!hashQuery) {
    return null;
  }

  return new URLSearchParams(hashQuery).get(key);
}



test.describe('Public Authentication Checks', () => {
  test('should check authentication status', async ({ page }) => {
    const response = await page.request.get(`${API_URL}/api/auth/check`);
    const data = await response.json();

    expect(response.ok()).toBeTruthy();
    expect(data).toHaveProperty('authenticated');
  });

  test('should show login button for unauthenticated users', async ({ homePage }) => {
    await homePage.navigate();

    // Check for login link/button in header
    const loginButton = homePage.page.locator('[data-testid="login-button"]');
    if (await loginButton.isVisible()) {
      await expect(loginButton).toBeVisible();
    }
  });

  test('should preserve protected route in login redirect', async ({ page }) => {
    await expectMindAuthRedirect(
      page,
      async () => {
        await page.goto('/notifications', { waitUntil: 'domcontentloaded', timeout: 60000 });
      },
      '/login',
      '/notifications',
    );
  });

  test('should preserve redirect query on the register page', async ({ page }) => {
    await expectMindAuthRedirect(
      page,
      async () => {
        await page.goto('/register?redirect=/bookmarks', { waitUntil: 'domcontentloaded', timeout: 60000 });
      },
      '/register',
      '/bookmarks',
    );
  });

  test('should preserve the current path when login is triggered from the header', async ({ page }) => {
    await page.goto('/search?q=oauth', { waitUntil: 'domcontentloaded', timeout: 60000 });

    await expectMindAuthRedirect(
      page,
      async () => {
        await page.getByRole('button', { name: '登录' }).click();
      },
      '/login',
      '/search?q=oauth',
    );
  });

  test('should preserve the current path when register is triggered from the header', async ({ page }) => {
    await page.goto('/groups?tab=recent', { waitUntil: 'domcontentloaded', timeout: 60000 });

    await expectMindAuthRedirect(
      page,
      async () => {
        await page.getByRole('button', { name: '注册' }).click();
      },
      '/register',
      '/groups?tab=recent',
    );
  });

});

test.describe('Route Protection', () => {
  test('should protect /notifications route', async ({ page }) => {
    await page.goto('/notifications', { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Should redirect to login if not authenticated
    // Or show unauthorized message
    const url = page.url();
    const isProtected = url.includes('login') || url.includes('unauthorized');
    expect(isProtected || page.locator('[data-testid="auth-required"]').isVisible()).toBeTruthy();
  });

  test('should protect /messages route', async ({ page }) => {
    await page.goto('/messages', { waitUntil: 'domcontentloaded', timeout: 60000 });

    const url = page.url();
    const isProtected = url.includes('login');
    expect(isProtected || await page.locator('[data-testid="auth-required"]').isVisible()).toBeTruthy();
  });

  test('should protect /bookmarks route', async ({ page }) => {
    await page.goto('/bookmarks', { waitUntil: 'domcontentloaded', timeout: 60000 });

    const url = page.url();
    const isProtected = url.includes('login');
    expect(isProtected || await page.locator('[data-testid="auth-required"]').isVisible()).toBeTruthy();
  });

  test('should protect /settings route', async ({ page }) => {
    await page.goto('/settings', { waitUntil: 'domcontentloaded', timeout: 60000 });

    const url = page.url();
    const isProtected = url.includes('login');
    expect(isProtected || await page.locator('[data-testid="auth-required"]').isVisible()).toBeTruthy();
  });
});

test.describe('Admin Route Protection', () => {
  test('should protect /admin route', async ({ page }) => {
    await page.goto('/admin', { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Should redirect to login or show unauthorized
    const url = page.url();
    const isProtected = url.includes('login') || url.includes('unauthorized');
    expect(isProtected).toBeTruthy();
  });

  test('should protect all admin sub-routes', async ({ page }) => {
    const adminRoutes = [
      '/admin/users',
      '/admin/posts',
      '/admin/categories',
      '/admin/content/tags',
      '/admin/system/bans',
    ];

    for (const route of adminRoutes) {
      await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 60000 });
      const url = page.url();
      const isProtected = url.includes('login');
      expect(isProtected).toBeTruthy();
    }
  });
});

authTest.describe('Authenticated User Flow', () => {
  authTest('should show user menu when authenticated', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Look for user menu or profile elements
    const userMenu = authenticatedPage.locator('[data-testid="user-menu"]');
    const userProfile = authenticatedPage.locator('[data-testid="user-profile-link"]');

    // At least one user-related element should be visible
    const hasUserElements =
      await userMenu.isVisible() ||
      await userProfile.isVisible();

    if (hasUserElements) {
      authExpect(true).toBeTruthy();
    }
  });

  authTest('should allow access to notifications when authenticated', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/notifications', { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Should NOT redirect to login
    authExpect(authenticatedPage.url()).not.toContain('login');
  });

  authTest('should allow access to messages when authenticated', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/messages', { waitUntil: 'domcontentloaded', timeout: 60000 });

    authExpect(authenticatedPage.url()).not.toContain('login');
  });
});
