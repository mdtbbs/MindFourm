// @ts-check
const { test } = require('../fixtures/fixtures');
const { createTestIdentity, deleteTestIdentity } = require('../helpers/auth');

test.describe('2. Dark Mode Toggle', () => {
  test('should default to light mode', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check that dark class is NOT present initially
    const hasDark = await page.evaluate(() => {
      return document.documentElement.classList.contains('dark');
    });
    test.expect(hasDark).toBe(false);
  });

  test('should toggle dark mode when clicking theme button', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Find and click theme toggle
    const themeToggle = page.locator('button[aria-label*="主题"], button[aria-label*="theme"], button:has(svg)').first();
    await themeToggle.click();

    await page.waitForTimeout(500);

    // Check dark class is now present
    const hasDark = await page.evaluate(() => {
      return document.documentElement.classList.contains('dark');
    });
    test.expect(hasDark).toBe(true);
  });

  test('should persist theme preference in localStorage', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Toggle to dark mode
    const themeToggle = page.locator('button[aria-label*="主题"], button[aria-label*="theme"], button:has(svg)').first();
    await themeToggle.click();
    await page.waitForTimeout(500);

    // Check localStorage has theme preference
    const theme = await page.evaluate(() => {
      return localStorage.getItem('theme');
    });
    test.expect(theme).toBe('dark');
  });

  test('should restore theme on page reload', async ({ page }) => {
    // 先访问页面确保主题系统初始化
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // 点击toggle切换到dark模式（使用UI操作而非直接设置localStorage）
    const themeToggle = page.locator('button[aria-label*="主题"], button[aria-label*="theme"], button:has(svg)').first();
    await themeToggle.click();
    await page.waitForTimeout(500);

    // 验证dark类已添加
    const hasDarkBefore = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    test.expect(hasDarkBefore).toBe(true);

    // 验证localStorage已设置为dark
    const themeBefore = await page.evaluate(() => localStorage.getItem('theme'));
    test.expect(themeBefore).toBe('dark');

    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // 等待hydration完成和主题恢复
    await page.waitForTimeout(3000);

    // 验证localStorage中的主题设置保持不变
    const storedTheme = await page.evaluate(() => localStorage.getItem('theme'));
    test.expect(storedTheme).toBe('dark');

    // Dark mode should be restored by layout.tsx script or ThemeProvider
    const hasDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    test.expect(hasDark).toBe(true);
  });

  test('should have dark classes on major components', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Enable dark mode
    const themeToggle = page.locator('button:has(svg)').first();
    await themeToggle.click();
    await page.waitForTimeout(500);

    // Check that key elements have dark mode classes
    const bodyClasses = await page.locator('body').getAttribute('class');
    const html = await page.content();

    // The HTML should contain dark: tailwind classes
    test.expect(html).toContain('dark:');
  });
});
