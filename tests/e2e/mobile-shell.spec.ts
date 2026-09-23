import { test, expect } from '@playwright/test';

test.describe('Mobile content shell', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('primary navigation opens an accessible publish sheet', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const navigation = page.getByTestId('mobile-bottom-navigation');
    await expect(navigation).toBeVisible();
    await expect(navigation.getByRole('link', { name: '首页' })).toBeVisible();
    await expect(navigation.getByRole('link', { name: '资源' })).toBeVisible();

    await navigation.getByRole('button', { name: '打开发布菜单' }).click();
    const dialog = page.getByRole('dialog', { name: '选择发布内容' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('link', { name: /快速提交蓝图/ })).toHaveAttribute('href', '/resources/submit/schematic');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('home and resource pages do not overflow at supported mobile widths', async ({ page }) => {
    for (const width of [360, 375, 390, 412, 430, 768, 1024, 1366]) {
      await page.setViewportSize({ width, height: 844 });
      for (const route of ['/', '/resources']) {
        await page.goto(route, { waitUntil: 'domcontentloaded' });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
        expect(overflow, `${route} overflows horizontally at ${width}px`).toBe(false);
        if (width >= 1024) {
          await expect(page.getByTestId('content-sidebar')).toBeVisible();
          await expect(page.getByTestId('mobile-bottom-navigation')).toBeHidden();
        } else {
          await expect(page.getByTestId('mobile-bottom-navigation')).toBeVisible();
        }
      }
    }
  });
});
