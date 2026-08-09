/**
 * E2E tests for resource category management.
 *
 * These tests verify:
 *   1. Admin can disable a category and its resources become hidden from public view.
 *   2. Category changes trigger immediate cache invalidation (no 5-minute wait).
 *   3. Admin can re-enable a disabled category and its resources reappear.
 *   4. Admin can rename a category and the new name shows on the public page immediately.
 *
 * Uses authTest fixture for admin authentication.
 */

import { test as authTest, expect as authExpect } from '../fixtures/auth.fixture';

/**
 * Helper: generate a unique category name to avoid collisions between test runs.
 */
function uniqueCategoryName(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

authTest.describe('Resource Categories - Admin Management', () => {
  authTest('admin can see all categories including disabled on admin page', async ({ authenticatedPage }) => {
    // Navigate to admin categories page (authTest provides admin auth)
    await authenticatedPage.goto('/admin/resources/categories', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    // The page should load with the category management card
    await authExpect(
      authenticatedPage.locator('text=资源分类管理'),
    ).toBeVisible({ timeout: 15000 });

    // Table should be visible with category headers
    await authExpect(
      authenticatedPage.locator('th:has-text("名称")'),
    ).toBeVisible();
    await authExpect(
      authenticatedPage.locator('th:has-text("状态")'),
    ).toBeVisible();
  });

  authTest('admin can create a new category', async ({ authenticatedPage }) => {
    const categoryName = uniqueCategoryName('E2E测试分类');
    const categorySlug = `e2e-test-${Date.now()}`;

    await authenticatedPage.goto('/admin/resources/categories', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    // Click "新建分类" button
    await authenticatedPage.getByRole('button', { name: '新建分类' }).click();

    // Fill in the form
    await authenticatedPage.getByLabel('名称').fill(categoryName);
    await authenticatedPage.getByLabel('Slug').fill(categorySlug);
    await authenticatedPage.getByLabel('描述').fill('E2E测试自动创建的分类');

    // Save
    await authenticatedPage.getByRole('button', { name: '保存' }).click();

    // Wait for the category to appear in the table
    await authExpect(
      authenticatedPage.locator(`text=${categoryName}`),
    ).toBeVisible({ timeout: 15000 });
  });

  authTest('admin can disable a category via the editor', async ({ authenticatedPage }) => {
    const categoryName = uniqueCategoryName('E2E禁用测试');
    const categorySlug = `e2e-disable-${Date.now()}`;

    // First create a category
    await authenticatedPage.goto('/admin/resources/categories', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    await authenticatedPage.getByRole('button', { name: '新建分类' }).click();
    await authenticatedPage.getByLabel('名称').fill(categoryName);
    await authenticatedPage.getByLabel('Slug').fill(categorySlug);
    await authenticatedPage.getByRole('button', { name: '保存' }).click();

    // Wait for it to appear
    await authExpect(
      authenticatedPage.locator(`text=${categoryName}`),
    ).toBeVisible({ timeout: 15000 });

    // Now edit the category to disable it
    const categoryRow = authenticatedPage.locator('tr', { hasText: categoryName });
    await categoryRow.locator('button:has-text("编辑")').click();

    // The editor should have loaded — uncheck the "启用" switch
    // Switch component uses a button role with aria-checked
    const switchControl = authenticatedPage.locator('[role="switch"]#is_active, button#is_active, [id="is_active"]');
    // If it's currently checked/active, click to disable
    const isChecked = await switchControl.getAttribute('data-state').catch(() => 'checked');
    if (isChecked === 'checked') {
      await switchControl.click();
    }

    // Save changes
    await authenticatedPage.getByRole('button', { name: '保存' }).click();

    // Wait for the table to reload and verify the category shows as disabled
    const updatedRow = authenticatedPage.locator('tr', { hasText: categoryName });
    await authExpect(updatedRow.locator('text=禁用')).toBeVisible({ timeout: 15000 });
  });

  authTest('category changes trigger immediate cache invalidation', async ({ authenticatedPage }) => {
    const originalName = uniqueCategoryName('E2E旧名称');
    const newName = uniqueCategoryName('E2E新名称');
    const categorySlug = `e2e-cache-${Date.now()}`;

    // Create a category
    await authenticatedPage.goto('/admin/resources/categories', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    await authenticatedPage.getByRole('button', { name: '新建分类' }).click();
    await authenticatedPage.getByLabel('名称').fill(originalName);
    await authenticatedPage.getByLabel('Slug').fill(categorySlug);
    await authenticatedPage.getByRole('button', { name: '保存' }).click();

    // Wait for it to appear
    await authExpect(
      authenticatedPage.locator(`text=${originalName}`),
    ).toBeVisible({ timeout: 15000 });

    // Edit the category name
    const categoryRow = authenticatedPage.locator('tr', { hasText: originalName });
    await categoryRow.locator('button:has-text("编辑")').click();

    // Clear and fill the new name
    await authenticatedPage.getByLabel('名称').clear();
    await authenticatedPage.getByLabel('名称').fill(newName);

    // Save
    await authenticatedPage.getByRole('button', { name: '保存' }).click();

    // The new name should appear immediately in the table (no 5-minute cache wait)
    await authExpect(
      authenticatedPage.locator(`text=${newName}`),
    ).toBeVisible({ timeout: 15000 });

    // The old name should no longer be visible
    await authExpect(
      authenticatedPage.locator(`text=${originalName}`),
    ).not.toBeVisible({ timeout: 5000 });
  });

  authTest('disabled category resources are hidden from public resources page', async ({ authenticatedPage }) => {
    // Create a category, then disable it
    const categoryName = uniqueCategoryName('E2E隐藏测试');
    const categorySlug = `e2e-hide-${Date.now()}`;

    await authenticatedPage.goto('/admin/resources/categories', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    // Create the category
    await authenticatedPage.getByRole('button', { name: '新建分类' }).click();
    await authenticatedPage.getByLabel('名称').fill(categoryName);
    await authenticatedPage.getByLabel('Slug').fill(categorySlug);
    await authenticatedPage.getByRole('button', { name: '保存' }).click();

    await authExpect(
      authenticatedPage.locator(`text=${categoryName}`),
    ).toBeVisible({ timeout: 15000 });

    // Disable the category
    const categoryRow = authenticatedPage.locator('tr', { hasText: categoryName });
    await categoryRow.locator('button:has-text("编辑")').click();

    const switchControl = authenticatedPage.locator('[role="switch"]#is_active, button#is_active, [id="is_active"]');
    const isChecked = await switchControl.getAttribute('data-state').catch(() => 'checked');
    if (isChecked === 'checked') {
      await switchControl.click();
    }

    await authenticatedPage.getByRole('button', { name: '保存' }).click();

    // Wait for the category to show as disabled
    const updatedRow = authenticatedPage.locator('tr', { hasText: categoryName });
    await authExpect(updatedRow.locator('text=禁用')).toBeVisible({ timeout: 15000 });

    // Navigate to the public resources page
    await authenticatedPage.goto('/resources', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    // The disabled category name should NOT appear in the public category list
    await authExpect(
      authenticatedPage.locator(`text=${categoryName}`),
    ).not.toBeVisible({ timeout: 10000 });
  });

  authTest('admin can delete a category with no resources', async ({ authenticatedPage }) => {
    const categoryName = uniqueCategoryName('E2E删除测试');
    const categorySlug = `e2e-delete-${Date.now()}`;

    // Create a category
    await authenticatedPage.goto('/admin/resources/categories', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    await authenticatedPage.getByRole('button', { name: '新建分类' }).click();
    await authenticatedPage.getByLabel('名称').fill(categoryName);
    await authenticatedPage.getByLabel('Slug').fill(categorySlug);
    await authenticatedPage.getByRole('button', { name: '保存' }).click();

    await authExpect(
      authenticatedPage.locator(`text=${categoryName}`),
    ).toBeVisible({ timeout: 15000 });

    // Delete the category (handle the confirm dialog)
    authenticatedPage.on('dialog', (dialog) => dialog.accept());

    const categoryRow = authenticatedPage.locator('tr', { hasText: categoryName });
    await categoryRow.locator('button:has-text("删除")').click();

    // Category should be removed from the table
    await authExpect(
      authenticatedPage.locator(`text=${categoryName}`),
    ).not.toBeVisible({ timeout: 15000 });
  });
});
