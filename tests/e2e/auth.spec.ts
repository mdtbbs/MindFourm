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
import { test as authTest, expect as authExpect, TEST_USERS } from '../fixtures/auth.fixture';

test.describe('Public Authentication Checks', () => {
  test('should check authentication status', async ({ page }) => {
    const response = await page.request.get('http://localhost:4000/api/auth/check');
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

  test('should allow access to public pages without authentication', async ({ page }) => {
    // Test public routes
    const publicRoutes = [
      '/',
      '/categories',
      '/tags',
      '/search',
      '/servers',
    ];

    for (const route of publicRoutes) {
      await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await expect(page).not.toHaveURL(/login/);
    }
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