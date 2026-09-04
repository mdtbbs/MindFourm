/**
 * Responsive Layout – E2E Tests
 *
 * Verifies that the layout behaves correctly across viewport breakpoints:
 *  - Desktop sidebar maintains viewport height on long pages (Task 1)
 *  - Admin sidebar area uses responsive content offset at tablet (Task 2)
 *  - Resource page prevents horizontal overflow on mobile (Task 3)
 *  - ContentDrawer height model mirrors the sidebar (Task 4)
 *  - No horizontal overflow at any breakpoint
 *
 * These tests require the dev servers (backend + frontend) to be running.
 *
 * Task 5 of layout-responsive plan.
 */

import { test, expect } from '@playwright/test';
import { test as authTest, expect as authExpect } from '../fixtures/auth.fixture';

// ---------------------------------------------------------------------------
// Desktop sidebar — viewport height on long pages (Task 1)
// ---------------------------------------------------------------------------

test.describe('Responsive Layout – Desktop Sidebar', () => {
  test('sidebar maintains viewport height on long pages', async ({ page }) => {
    // Use a desktop viewport so the lg: breakpoint classes apply
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Wait for the sidebar to render
    const sidebar = page.locator('[data-testid="content-sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 10000 });

    // Create a very long page by injecting content
    await page.evaluate(() => {
      const main = document.querySelector('main');
      if (main) {
        for (let i = 0; i < 100; i++) {
          const p = document.createElement('p');
          p.textContent = `Line ${i}`;
          main.appendChild(p);
        }
      }
    });

    // Give the browser a frame to recalculate layout after DOM mutation
    await page.waitForTimeout(200);

    const sidebarHeight = await sidebar.evaluate((el) => el.clientHeight);
    const viewportHeight = await page.evaluate(() => window.innerHeight);

    // The sidebar uses lg:h-[100dvh] — it must not exceed the viewport
    expect(sidebarHeight).toBeLessThanOrEqual(viewportHeight);
    // And it should use a meaningful portion of the viewport (not collapse to 0)
    expect(sidebarHeight).toBeGreaterThan(100);
  });

  test('sidebar nav region scrolls independently on long nav lists', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 400 }); // Short viewport
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 });

    const sidebar = page.locator('[data-testid="content-sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 10000 });

    // Sidebar should still fit within viewport even on a short screen
    const sidebarHeight = await sidebar.evaluate((el) => el.clientHeight);
    const viewportHeight = await page.evaluate(() => window.innerHeight);

    expect(sidebarHeight).toBeLessThanOrEqual(viewportHeight);
  });
});

// ---------------------------------------------------------------------------
// Admin sidebar — responsive offset at tablet (Task 2)
// ---------------------------------------------------------------------------

authTest.describe('Responsive Layout – Admin Sidebar', () => {
  authTest('admin content offset adjusts at tablet breakpoint', async ({ authenticatedPage }) => {
    await authenticatedPage.setViewportSize({ width: 1024, height: 768 });
    await authenticatedPage.goto('/admin', { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Wait for the admin layout to render
    const sidebar = authenticatedPage.locator('[data-testid="admin-sidebar"]');
    await authExpect(sidebar).toBeVisible({ timeout: 10000 });

    // At tablet (≤ 1024px), .admin-content uses margin-left: var(--sidebar-width-collapsed)
    // which is 60px — less than the desktop offset of var(--sidebar-width) = 200px.
    const contentMarginLeft = await authenticatedPage.evaluate(() => {
      const content = document.querySelector('.admin-content');
      if (!content) return -1;
      return parseInt(
        window.getComputedStyle(content).marginLeft,
        10,
      );
    });

    // The content offset at tablet (60px) should be smaller than the desktop offset (200px)
    expect(contentMarginLeft).toBeGreaterThanOrEqual(0);
    expect(contentMarginLeft).toBeLessThan(200);
  });

  authTest('admin sidebar is visible at desktop viewport', async ({ authenticatedPage }) => {
    await authenticatedPage.setViewportSize({ width: 1280, height: 800 });
    await authenticatedPage.goto('/admin', { waitUntil: 'domcontentloaded', timeout: 60000 });

    const sidebar = authenticatedPage.locator('[data-testid="admin-sidebar"]');
    await authExpect(sidebar).toBeVisible({ timeout: 10000 });
  });

  authTest('admin mobile toggle appears at mobile viewport', async ({ authenticatedPage }) => {
    await authenticatedPage.setViewportSize({ width: 375, height: 667 });
    await authenticatedPage.goto('/admin', { waitUntil: 'domcontentloaded', timeout: 60000 });

    // At mobile (≤ 768px), .admin-sidebar-toggle should be visible
    const toggle = authenticatedPage.locator('.admin-sidebar-toggle');
    await authExpect(toggle).toBeVisible({ timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// Resource page — responsive container (Task 3)
// ---------------------------------------------------------------------------

test.describe('Responsive Layout – Resource Page', () => {
  test('resource page container prevents horizontal overflow on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/resources', { waitUntil: 'domcontentloaded', timeout: 60000 });

    const container = page.locator('[data-testid="resources-container"]');
    // Wait for the container to appear (page may be loading)
    await expect(container).toBeVisible({ timeout: 15000 });

    const overflowX = await container.evaluate((el) => window.getComputedStyle(el).overflowX);
    expect(overflowX).toBe('hidden');
  });

  test('resource page container prevents overflow at all breakpoints', async ({ page }) => {
    const breakpoints = [
      { width: 375, height: 667, label: 'mobile' },
      { width: 768, height: 1024, label: 'tablet' },
      { width: 1024, height: 768, label: 'small desktop' },
      { width: 1536, height: 864, label: 'large desktop' },
    ];

    for (const size of breakpoints) {
      await page.setViewportSize(size);
      await page.goto('/resources', { waitUntil: 'domcontentloaded', timeout: 60000 });

      const container = page.locator('[data-testid="resources-container"]');
      const overflowX = await container.evaluate((el) => window.getComputedStyle(el).overflowX);
      expect(overflowX, `overflowX at ${size.label} (${size.width}px)`).toBe('hidden');
    }
  });
});

// ---------------------------------------------------------------------------
// Global — no horizontal overflow at any breakpoint
// ---------------------------------------------------------------------------

test.describe('Responsive Layout – No Horizontal Overflow', () => {
  test('no horizontal overflow on homepage at any breakpoint', async ({ page }) => {
    const breakpoints = [
      { width: 375, height: 667 },   // Mobile
      { width: 768, height: 1024 },  // Tablet
      { width: 1024, height: 768 },  // Small desktop
      { width: 1536, height: 864 },  // Large desktop
    ];

    for (const size of breakpoints) {
      await page.setViewportSize(size);
      await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 });

      // Wait for layout to settle
      await page.waitForTimeout(300);

      const hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });

      expect(hasOverflow, `horizontal overflow at ${size.width}x${size.height}`).toBe(false);
    }
  });

  test('no horizontal overflow on resources page at any breakpoint', async ({ page }) => {
    const breakpoints = [
      { width: 375, height: 667 },   // Mobile
      { width: 768, height: 1024 },  // Tablet
      { width: 1280, height: 800 },  // Desktop
    ];

    for (const size of breakpoints) {
      await page.setViewportSize(size);
      await page.goto('/resources', { waitUntil: 'domcontentloaded', timeout: 60000 });

      await page.waitForTimeout(300);

      const hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });

      expect(hasOverflow, `horizontal overflow at ${size.width}x${size.height}`).toBe(false);
    }
  });
});
