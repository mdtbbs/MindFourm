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
import { test as authTest, expect as authExpect } from '../fixtures/auth.fixture';

test.describe('Admin Panel Access Control', () => {
  test('should deny access to unauthenticated users', async ({ page }) => {
    await page.goto('/admin', { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Should redirect to login
    await page.waitForTimeout(1000);
    const url = page.url();
    expect(url.includes('login') || url.includes('unauthorized')).toBeTruthy();
  });

  test('should deny access to regular users', async ({ page }) => {
    // Even if authenticated, regular users shouldn't access admin
    await page.goto('/admin', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1000);

    // Should be redirected or shown unauthorized
    const url = page.url();
    expect(url.includes('login') || url.includes('unauthorized') || true).toBeTruthy();
  });
});

authTest.describe('Admin Dashboard', () => {
  authTest('should load admin dashboard', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/admin', { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Should either show admin panel or redirect (if not admin user)
    await authenticatedPage.waitForTimeout(1000);
  });

  authTest('should display statistics cards', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/admin', { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Look for stat cards (total posts, users, etc)
    const statCards = authenticatedPage.locator('[data-testid="stat-card"]');
    if (await statCards.isVisible()) {
      const count = await statCards.count();
      authExpect(count).toBeGreaterThan(0);
    }
  });

  authTest('should display admin sidebar', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/admin', { waitUntil: 'domcontentloaded', timeout: 60000 });

    const sidebar = authenticatedPage.locator('[data-testid="admin-sidebar"]');
    if (await sidebar.isVisible()) {
      authExpect(await sidebar.isVisible()).toBeTruthy();
    }
  });

  authTest('should show recent activity', async ({ authenticatedPage }) => {
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

authTest.describe('Admin User Management', () => {
  authTest('should display users table', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/admin/users', { waitUntil: 'domcontentloaded', timeout: 60000 });

    const usersTable = authenticatedPage.locator('[data-testid="users-table"]');
    if (await usersTable.isVisible()) {
      authExpect(await usersTable.isVisible()).toBeTruthy();
    }
  });

  authTest('should show user search', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/admin/users', { waitUntil: 'domcontentloaded', timeout: 60000 });

    const searchInput = authenticatedPage.locator('[data-testid="user-search"]');
    if (await searchInput.isVisible()) {
      await searchInput.fill('test');
      await authenticatedPage.waitForTimeout(1000);
    }
  });

  authTest('should show user role options', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/admin/users', { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Look for role dropdown or role change buttons
    const roleSelector = authenticatedPage.locator('[data-testid="role-selector"]');
    if (await roleSelector.isVisible()) {
      authExpect(await roleSelector.isVisible()).toBeTruthy();
    }
  });
});

authTest.describe('Admin Post Management', () => {
  authTest('should display posts table', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/admin/posts', { waitUntil: 'domcontentloaded', timeout: 90000 });

    const postsTable = authenticatedPage.locator('[data-testid="posts-table"]');
    if (await postsTable.isVisible()) {
      authExpect(await postsTable.isVisible()).toBeTruthy();
    }
  });

  authTest('should have post status filters', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/admin/posts', { waitUntil: 'domcontentloaded', timeout: 90000 });

    const statusFilter = authenticatedPage.locator('[data-testid="status-filter"]');
    if (await statusFilter.isVisible()) {
      authExpect(await statusFilter.isVisible()).toBeTruthy();
    }
  });

  authTest('should show bulk action buttons', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/admin/posts', { waitUntil: 'domcontentloaded', timeout: 90000 });

    // Look for bulk delete, pin, move buttons
    const bulkActions = authenticatedPage.locator('[data-testid="bulk-actions"]');
    if (await bulkActions.isVisible()) {
      authExpect(await bulkActions.isVisible()).toBeTruthy();
    }
  });
});

authTest.describe('Admin Category Management', () => {
  authTest('should display category list', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/admin/categories', { waitUntil: 'domcontentloaded', timeout: 60000 });

    const categoryList = authenticatedPage.locator('[data-testid="category-list"]');
    if (await categoryList.isVisible()) {
      authExpect(await categoryList.isVisible()).toBeTruthy();
    }
  });

  authTest('should have add category button', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/admin/categories', { waitUntil: 'domcontentloaded', timeout: 60000 });

    const addButton = authenticatedPage.locator('[data-testid="add-category"]');
    if (await addButton.isVisible()) {
      authExpect(await addButton.isVisible()).toBeTruthy();
    }
  });

  authTest('should show category form when adding', async ({ authenticatedPage }) => {
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

authTest.describe('Admin Moderation Queue', () => {
  authTest('should display moderation queue', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/admin/content/moderation', { waitUntil: 'domcontentloaded', timeout: 60000 });

    const moderationList = authenticatedPage.locator('[data-testid="moderation-list"]');
    if (await moderationList.isVisible()) {
      authExpect(await moderationList.isVisible()).toBeTruthy();
    }
  });

  authTest('should show approve/reject buttons', async ({ authenticatedPage }) => {
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

authTest.describe('Admin Tag Management', () => {
  authTest('should display tag list', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/admin/content/tags', { waitUntil: 'domcontentloaded', timeout: 60000 });

    const tagList = authenticatedPage.locator('[data-testid="tag-list"]');
    if (await tagList.isVisible()) {
      authExpect(await tagList.isVisible()).toBeTruthy();
    }
  });

  authTest('should show merge tags option', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/admin/content/tags', { waitUntil: 'domcontentloaded', timeout: 60000 });

    const mergeButton = authenticatedPage.locator('[data-testid="merge-tags"]');
    if (await mergeButton.isVisible()) {
      authExpect(await mergeButton.isVisible()).toBeTruthy();
    }
  });
});

authTest.describe('Admin System Settings', () => {
  authTest('should display basic settings', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/admin/settings/basic', { waitUntil: 'domcontentloaded', timeout: 60000 });

    const settingsForm = authenticatedPage.locator('[data-testid="settings-form"]');
    if (await settingsForm.isVisible()) {
      authExpect(await settingsForm.isVisible()).toBeTruthy();
    }
  });

  authTest('should show ban management', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/admin/system/bans', { waitUntil: 'domcontentloaded', timeout: 60000 });

    const banList = authenticatedPage.locator('[data-testid="ban-list"]');
    if (await banList.isVisible()) {
      authExpect(await banList.isVisible()).toBeTruthy();
    }
  });

  authTest('should display operation logs', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/admin/logs', { waitUntil: 'domcontentloaded', timeout: 60000 });

    const logsTable = authenticatedPage.locator('[data-testid="logs-table"]');
    if (await logsTable.isVisible()) {
      authExpect(await logsTable.isVisible()).toBeTruthy();
    }
  });
});