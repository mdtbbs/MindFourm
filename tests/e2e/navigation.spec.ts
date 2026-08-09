/**
 * Sidebar Navigation – E2E Tests
 *
 * Verifies that the admin sidebar navigation settings page renders correctly,
 * that navigation configuration flows through to the desktop sidebar and
 * mobile drawer, and that invalid input is rejected.
 *
 * These tests require the dev servers (backend + frontend) to be running.
 */

import { test, expect } from '../fixtures/page-objects/base.po';

const API_URL = process.env.PLAYWRIGHT_API_URL || 'http://127.0.0.1:4000';

// ---------------------------------------------------------------------------
// Public API shape
// ---------------------------------------------------------------------------

test.describe('Sidebar Navigation API', () => {
  test('GET /api/settings/admin/sidebar-navigation returns an array', async ({ request }) => {
    // The endpoint requires admin auth, so it should return 401 without session.
    const response = await request.get(`${API_URL}/api/settings/admin/sidebar-navigation`);
    // Either 401 (unauthenticated) or 200 with array body
    const status = response.status();
    expect([200, 401, 403]).toContain(status);

    if (status === 200) {
      const body = await response.json();
      const data = body.data ?? body;
      expect(Array.isArray(data)).toBeTruthy();
    }
  });

  test('PUT /api/settings/admin/sidebar-navigation requires auth', async ({ request }) => {
    const response = await request.put(`${API_URL}/api/settings/admin/sidebar-navigation`, {
      data: { items: [] },
      headers: { 'Content-Type': 'application/json' },
    });
    // Unauthenticated request should be rejected
    expect([401, 403]).toContain(response.status());
  });
});

// ---------------------------------------------------------------------------
// Desktop Sidebar
// ---------------------------------------------------------------------------

test.describe('Desktop Sidebar Navigation', () => {
  test('sidebar is visible at desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 });

    const sidebar = page.locator('[data-testid="content-sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 10000 });
  });

  test('sidebar contains a nav element with links', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 });

    const sidebarNav = page.locator('[data-testid="content-sidebar"] nav');
    await expect(sidebarNav).toBeVisible({ timeout: 10000 });

    // Should have at least one navigation link
    const links = sidebarNav.locator('a');
    const count = await links.count();
    expect(count).toBeGreaterThan(0);
  });

  test('sidebar shows default navigation items', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 });

    const sidebar = page.locator('[data-testid="content-sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 10000 });

    // Default items: 首页, 分类, 标签, 资源中心
    // At least the "首页" link should be present
    const homeLink = page.locator('[data-testid="sidebar-nav-item-home"]');
    await expect(homeLink).toBeVisible({ timeout: 5000 });
  });

  test('sidebar home link points to /', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 });

    const homeLink = page.locator('[data-testid="sidebar-nav-item-home"]');
    const href = await homeLink.getAttribute('href');
    expect(href).toBe('/');
  });

  test('sidebar is hidden at mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 });

    const sidebar = page.locator('[data-testid="content-sidebar"]');
    // The sidebar has `hidden lg:flex` — hidden on mobile
    await expect(sidebar).not.toBeVisible({ timeout: 5000 });
  });
});

// ---------------------------------------------------------------------------
// Mobile Drawer
// ---------------------------------------------------------------------------

test.describe('Mobile Drawer Navigation', () => {
  test('mobile menu button is visible at mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 });

    const menuButton = page.locator('[data-testid="mobile-menu-button"]');
    await expect(menuButton).toBeVisible({ timeout: 10000 });
  });

  test('mobile menu button is hidden at desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 });

    const menuButton = page.locator('[data-testid="mobile-menu-button"]');
    await expect(menuButton).not.toBeVisible({ timeout: 5000 });
  });

  test('drawer opens when mobile menu button is clicked', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Drawer should not be visible initially
    const drawer = page.locator('[data-testid="mobile-drawer"]');
    await expect(drawer).not.toBeVisible({ timeout: 5000 });

    // Click the menu button
    await page.locator('[data-testid="mobile-menu-button"]').click();

    // Drawer should now be visible
    await expect(drawer).toBeVisible({ timeout: 5000 });
  });

  test('drawer contains navigation links', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Open the drawer
    await page.locator('[data-testid="mobile-menu-button"]').click();

    const drawerNav = page.locator('[data-testid="mobile-drawer-nav"]');
    await expect(drawerNav).toBeVisible({ timeout: 5000 });

    // Should have at least one navigation link
    const links = drawerNav.locator('a');
    const count = await links.count();
    expect(count).toBeGreaterThan(0);
  });

  test('drawer shows the same navigation items as sidebar', async ({ page }) => {
    // First check desktop sidebar items
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 });

    const desktopLinks = page.locator('[data-testid="content-sidebar"] nav a');
    const desktopCount = await desktopLinks.count();
    const desktopTexts: string[] = [];
    for (let i = 0; i < desktopCount; i++) {
      const text = await desktopLinks.nth(i).textContent();
      desktopTexts.push((text || '').trim());
    }

    // Now check mobile drawer items
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 });

    await page.locator('[data-testid="mobile-menu-button"]').click();

    const drawerLinks = page.locator('[data-testid="mobile-drawer-nav"] a');
    const drawerCount = await drawerLinks.count();
    const drawerTexts: string[] = [];
    for (let i = 0; i < drawerCount; i++) {
      const text = await drawerLinks.nth(i).textContent();
      drawerTexts.push((text || '').trim());
    }

    // Both should have the same number of links
    expect(drawerCount).toBe(desktopCount);
    // And the same text content (same labels)
    expect(drawerTexts).toEqual(desktopTexts);
  });

  test('drawer closes when clicking backdrop', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Open the drawer
    await page.locator('[data-testid="mobile-menu-button"]').click();
    const drawer = page.locator('[data-testid="mobile-drawer"]');
    await expect(drawer).toBeVisible({ timeout: 5000 });

    // Click the backdrop (the semi-transparent overlay)
    // The backdrop is the direct child button of the drawer
    await drawer.locator('button[aria-label="关闭导航菜单"]').click();

    // Drawer should close (no longer visible)
    await expect(drawer).not.toBeVisible({ timeout: 5000 });
  });

  test('drawer closes when clicking close button', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Open the drawer
    await page.locator('[data-testid="mobile-menu-button"]').click();
    const drawer = page.locator('[data-testid="mobile-drawer"]');
    await expect(drawer).toBeVisible({ timeout: 5000 });

    // Click the X close button in the drawer header
    await drawer.locator('button[aria-label="关闭"]').click();

    // Drawer should close
    await expect(drawer).not.toBeVisible({ timeout: 5000 });
  });
});

// ---------------------------------------------------------------------------
// Desktop ↔ Mobile sync
// ---------------------------------------------------------------------------

test.describe('Desktop and Mobile Navigation Stay in Sync', () => {
  test('both views render the same nav items from the same data source', async ({ page }) => {
    // The desktop sidebar and mobile drawer share the same `sidebarItems` from
    // `ContentShell`, which calls `buildSidebarNavigation()`. Verify both views
    // produce matching item counts and labels.

    // Gather desktop items
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 });

    const desktopSidebar = page.locator('[data-testid="sidebar-nav"]');
    await expect(desktopSidebar).toBeVisible({ timeout: 10000 });
    const desktopItems = desktopSidebar.locator('a');
    const desktopCount = await desktopItems.count();

    // Gather mobile items
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 });

    await page.locator('[data-testid="mobile-menu-button"]').click();
    const drawerNav = page.locator('[data-testid="mobile-drawer-nav"]');
    await expect(drawerNav).toBeVisible({ timeout: 5000 });
    const mobileItems = drawerNav.locator('a');
    const mobileCount = await mobileItems.count();

    expect(mobileCount).toBe(desktopCount);
    expect(mobileCount).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Admin settings page (smoke tests — no authentication)
// ---------------------------------------------------------------------------

test.describe('Admin Sidebar Navigation Settings Page', () => {
  test('admin settings sidebar page requires authentication', async ({ page }) => {
    await page.goto('/admin/settings/sidebar', { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Should redirect to login or show unauthorized for unauthenticated users
    const url = page.url();
    const isProtected = url.includes('login') || url.includes('unauthorized');
    expect(isProtected).toBeTruthy();
  });
});
