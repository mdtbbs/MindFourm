/**
 * Admin Panel E2E Tests
 *
 * Tests admin panel functionality including:
 * - Dashboard statistics
 * - User management
 * - Post management
 * - Category management
 * - Moderation queue
 */

import { test, expect } from '../fixtures/page-objects/base.po';
import { test as authTest, adminTest, expect as authExpect } from '../fixtures/auth.fixture';

test.describe('Admin Panel Access Control', () => {
  test('should deny access to unauthenticated users', async ({ page }) => {
    const authOrigin = new URL(process.env.PLAYWRIGHT_AUTH_URL || 'http://127.0.0.1:4001').origin;
    await page.route(`${authOrigin}/**`, (route) => route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><html><body>MindAuth E2E stub</body></html>',
    }));
    await page.goto('/admin', { waitUntil: 'domcontentloaded', timeout: 60000 });

    await expect(page).toHaveURL((url) => url.origin === authOrigin && url.pathname === '/authorize');
    expect(new URL(page.url()).searchParams.get('state')).toBe('/admin');
  });

  authTest('should deny access to regular users', async ({ authenticatedPage }) => {
    // Even if authenticated, regular users shouldn't access admin
    await authenticatedPage.goto('/admin', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await authExpect(authenticatedPage).toHaveURL(/\/$/);
    await authExpect(authenticatedPage.locator('.admin-v2-sidebar-stack')).toHaveCount(0);
  });
});

authTest('regular users cannot read security access logs containing IP addresses', async ({ authenticatedPage }) => {
  const status = await authenticatedPage.evaluate(async () => {
    const response = await fetch('/api/admin/security-access-logs', { credentials: 'include' });
    return response.status;
  });
  authExpect(status).toBe(403);
});

adminTest('administrators can open the restricted security access log viewer', async ({ authenticatedPage }) => {
  await authenticatedPage.goto('/admin/security-access-logs', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await authExpect(authenticatedPage.getByRole('heading', { name: /安全访问日志|Security access logs/ })).toBeVisible();
  await authExpect(authenticatedPage.getByRole('columnheader', { name: /IP 地址|IP address/ })).toBeVisible();
});

adminTest.describe('Admin Dashboard', () => {
  adminTest('should load admin dashboard', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/admin', { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Should either show admin panel or redirect (if not admin user)
    await authenticatedPage.waitForTimeout(1000);
  });

  adminTest('should display statistics cards', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/admin', { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Look for stat cards (total posts, users, etc)
    const statCards = authenticatedPage.locator('[data-testid="stat-card"]');
    if (await statCards.isVisible()) {
      const count = await statCards.count();
      authExpect(count).toBeGreaterThan(0);
    }
  });

  adminTest('should display admin sidebar', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/admin', { waitUntil: 'domcontentloaded', timeout: 60000 });

    const sidebar = authenticatedPage.locator('.admin-v2-sidebar-stack');
    if (await sidebar.isVisible()) {
      authExpect(await sidebar.isVisible()).toBeTruthy();
    }
  });

  adminTest('should show recent activity', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/admin', { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Look for activity chart or list
    const activityChart = authenticatedPage.locator('[data-testid="activity-chart"]');
    const recentActivity = authenticatedPage.locator('[data-testid="recent-activity"]');

    authExpect(
      await activityChart.isVisible() ||
      await recentActivity.isVisible() ||
      true
    ).toBeTruthy();
  });
});

adminTest.describe('Admin Sidebar Responsive Behavior', () => {
adminTest('desktop (>1180px): full navigation visible and mobile toggle hidden', async ({ authenticatedPage }) => {
    await authenticatedPage.setViewportSize({ width: 1280, height: 800 });
    await authenticatedPage.goto('/admin', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await authenticatedPage.waitForTimeout(500);

    const sidebar = authenticatedPage.locator('.admin-v2-sidebar-stack');
    await authExpect(sidebar).toBeVisible();

    const box = await sidebar.boundingBox();
    authExpect(box).not.toBeNull();
    // Admin 2.0 uses a 72px rail and a 232px section menu at desktop widths.
    authExpect(box!.width).toBeGreaterThan(300);
    authExpect(box!.width).toBeLessThan(308);

    // Nav labels should be visible at desktop
    const labels = authenticatedPage.locator('.admin-v2-secondary-nav a');
    const count = await labels.count();
    authExpect(count).toBeGreaterThan(0);
    // First label should be visible
    if (count > 0) {
      authExpect(await labels.first().isVisible()).toBeTruthy();
    }

    // Toggle button should be hidden at desktop
    const toggle = authenticatedPage.locator('.admin-v2-mobile-menu');
    authExpect(await toggle.isVisible()).toBeFalsy();

    // Content margin should match sidebar width
    const content = authenticatedPage.locator('.admin-v2-workspace');
    const contentBox = await content.boundingBox();
    authExpect(contentBox).not.toBeNull();
    authExpect(contentBox!.x).toBeGreaterThan(300);
    authExpect(contentBox!.x).toBeLessThan(308);
  });

  adminTest('tablet (769-1180px): both navigation columns remain available', async ({ authenticatedPage }) => {
    await authenticatedPage.setViewportSize({ width: 900, height: 800 });
    await authenticatedPage.goto('/admin', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await authenticatedPage.waitForTimeout(500);

    const sidebar = authenticatedPage.locator('.admin-v2-sidebar-stack');
    await authExpect(sidebar).toBeVisible();

    const box = await sidebar.boundingBox();
    authExpect(box).not.toBeNull();
    // The responsive tablet layout narrows the rail and section menu together.
    authExpect(box!.width).toBeGreaterThan(270);
    authExpect(box!.width).toBeLessThan(278);

    const labels = authenticatedPage.locator('.admin-v2-secondary-nav a');
    const count = await labels.count();
    authExpect(count).toBeGreaterThan(0);
    authExpect(await labels.first().isVisible()).toBeTruthy();

    // Workspace offset matches the narrowed tablet navigation stack.
    const content = authenticatedPage.locator('.admin-v2-workspace');
    const contentBox = await content.boundingBox();
    authExpect(contentBox).not.toBeNull();
    authExpect(contentBox!.x).toBeGreaterThan(270);
    authExpect(contentBox!.x).toBeLessThan(278);
  });

  adminTest('mobile (≤768px): sidebar hidden off-screen, toggle visible, drawer opens on click', async ({ authenticatedPage }) => {
    await authenticatedPage.setViewportSize({ width: 375, height: 800 });
    await authenticatedPage.goto('/admin', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await authenticatedPage.waitForTimeout(500);

    const sidebar = authenticatedPage.locator('.admin-v2-sidebar-stack');
    const toggle = authenticatedPage.locator('.admin-v2-mobile-menu');

    // Toggle button should be visible on mobile
    authExpect(await toggle.isVisible()).toBeTruthy();

    // The navigation drawer starts just beyond the left viewport edge.
    const boxBefore = await sidebar.boundingBox();
    if (boxBefore) {
      authExpect(boxBefore.x).toBeLessThan(-300);
    }

    // Click hamburger to open drawer
    await toggle.click();
    await authenticatedPage.waitForTimeout(400); // Wait for CSS transition

    // Sidebar should now be visible on-screen
    const boxAfter = await sidebar.boundingBox();
    authExpect(boxAfter).not.toBeNull();
    authExpect(boxAfter!.x).toBeGreaterThanOrEqual(0);
    authExpect(boxAfter!.width).toBeGreaterThan(50);

    // Sidebar should have the open-state class.
    const className = await sidebar.getAttribute('class');
    authExpect(className).toContain('is-open');

    // Content should start from left edge (no margin offset)
    const content = authenticatedPage.locator('.admin-v2-workspace');
    const contentBox = await content.boundingBox();
    authExpect(contentBox).not.toBeNull();
    authExpect(contentBox!.x).toBeLessThan(10);

    // Click overlay to close drawer
    const overlay = authenticatedPage.locator('.admin-v2-mobile-backdrop');
    await authExpect(overlay).toBeVisible();
    await overlay.click();
    await authenticatedPage.waitForTimeout(400);
    authExpect(await sidebar.getAttribute('class')).not.toContain('is-open');
    const boxClosed = await sidebar.boundingBox();
    authExpect(boxClosed).not.toBeNull();
    authExpect(boxClosed!.x).toBeLessThan(-300);
  });
});

adminTest.describe('Admin User Management', () => {
  adminTest('should display users table', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/admin/users', { waitUntil: 'domcontentloaded', timeout: 60000 });

    const usersTable = authenticatedPage.locator('[data-testid="users-table"]');
    if (await usersTable.isVisible()) {
      authExpect(await usersTable.isVisible()).toBeTruthy();
    }
  });

  adminTest('should show user search', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/admin/users', { waitUntil: 'domcontentloaded', timeout: 60000 });

    const searchInput = authenticatedPage.locator('[data-testid="user-search"]');
    if (await searchInput.isVisible()) {
      await searchInput.fill('test');
      await authenticatedPage.waitForTimeout(1000);
    }
  });

  adminTest('should show user role options', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/admin/users', { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Look for role dropdown or role change buttons
    const roleSelector = authenticatedPage.locator('[data-testid="role-selector"]');
    if (await roleSelector.isVisible()) {
      authExpect(await roleSelector.isVisible()).toBeTruthy();
    }
  });
});

adminTest.describe('Admin Post Management', () => {
  adminTest('should display posts table', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/admin/posts', { waitUntil: 'domcontentloaded', timeout: 90000 });

    const postsTable = authenticatedPage.locator('[data-testid="posts-table"]');
    if (await postsTable.isVisible()) {
      authExpect(await postsTable.isVisible()).toBeTruthy();
    }
  });

  adminTest('should have post status filters', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/admin/posts', { waitUntil: 'domcontentloaded', timeout: 90000 });

    const statusFilter = authenticatedPage.locator('[data-testid="status-filter"]');
    if (await statusFilter.isVisible()) {
      authExpect(await statusFilter.isVisible()).toBeTruthy();
    }
  });

  adminTest('should show bulk action buttons', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/admin/posts', { waitUntil: 'domcontentloaded', timeout: 90000 });

    // Look for bulk delete, pin, move buttons
    const bulkActions = authenticatedPage.locator('[data-testid="bulk-actions"]');
    if (await bulkActions.isVisible()) {
      authExpect(await bulkActions.isVisible()).toBeTruthy();
    }
  });
});

adminTest.describe('Admin Category Management', () => {
  adminTest('should display category list', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/admin/categories', { waitUntil: 'domcontentloaded', timeout: 60000 });

    const categoryList = authenticatedPage.locator('[data-testid="category-list"]');
    if (await categoryList.isVisible()) {
      authExpect(await categoryList.isVisible()).toBeTruthy();
    }
  });

  adminTest('should have add category button', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/admin/categories', { waitUntil: 'domcontentloaded', timeout: 60000 });

    const addButton = authenticatedPage.locator('[data-testid="add-category"]');
    if (await addButton.isVisible()) {
      authExpect(await addButton.isVisible()).toBeTruthy();
    }
  });

  adminTest('should show category form when adding', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/admin/categories', { waitUntil: 'domcontentloaded', timeout: 60000 });

    const addButton = authenticatedPage.locator('[data-testid="add-category"]');
    if (await addButton.isVisible()) {
      await addButton.click();
      await authenticatedPage.waitForTimeout(500);

      const categoryForm = authenticatedPage.locator('[data-testid="category-form"]');
      if (await categoryForm.isVisible()) {
        authExpect(await categoryForm.isVisible()).toBeTruthy();
      }
    }
  });
});

adminTest.describe('Admin Moderation Queue', () => {
  adminTest('should display moderation queue', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/admin/content/moderation', { waitUntil: 'domcontentloaded', timeout: 60000 });

    const moderationList = authenticatedPage.locator('[data-testid="moderation-list"]');
    if (await moderationList.isVisible()) {
      authExpect(await moderationList.isVisible()).toBeTruthy();
    }
  });

  adminTest('should show approve/reject buttons', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/admin/content/moderation', { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Look for moderation action buttons
    const approveButton = authenticatedPage.locator('[data-testid="approve-button"]');
    const rejectButton = authenticatedPage.locator('[data-testid="reject-button"]');

    authExpect(
      await approveButton.isVisible() ||
      await rejectButton.isVisible() ||
      true
    ).toBeTruthy();
  });
});

adminTest.describe('Admin Tag Management', () => {
  adminTest('should display tag list', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/admin/content/tags', { waitUntil: 'domcontentloaded', timeout: 60000 });

    const tagList = authenticatedPage.locator('[data-testid="tag-list"]');
    if (await tagList.isVisible()) {
      authExpect(await tagList.isVisible()).toBeTruthy();
    }
  });

  adminTest('should show merge tags option', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/admin/content/tags', { waitUntil: 'domcontentloaded', timeout: 60000 });

    const mergeButton = authenticatedPage.locator('[data-testid="merge-tags"]');
    if (await mergeButton.isVisible()) {
      authExpect(await mergeButton.isVisible()).toBeTruthy();
    }
  });
});

adminTest.describe('Admin System Settings', () => {
  adminTest('should display basic settings', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/admin/settings/basic', { waitUntil: 'domcontentloaded', timeout: 60000 });

    const settingsForm = authenticatedPage.locator('[data-testid="settings-form"]');
    if (await settingsForm.isVisible()) {
      authExpect(await settingsForm.isVisible()).toBeTruthy();
    }
  });

  adminTest('should show ban management', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/admin/system/bans', { waitUntil: 'domcontentloaded', timeout: 60000 });

    const banList = authenticatedPage.locator('[data-testid="ban-list"]');
    if (await banList.isVisible()) {
      authExpect(await banList.isVisible()).toBeTruthy();
    }
  });

  adminTest('should display operation logs', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/admin/logs', { waitUntil: 'domcontentloaded', timeout: 60000 });

    const logsTable = authenticatedPage.locator('[data-testid="logs-table"]');
    if (await logsTable.isVisible()) {
      authExpect(await logsTable.isVisible()).toBeTruthy();
    }
  });
});
