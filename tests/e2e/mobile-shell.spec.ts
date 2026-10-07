import type { Page } from '@playwright/test';
import { test, expect } from '@playwright/test';
import { test as authTest, adminTest } from '../fixtures/auth.fixture';

const PHONE = { width: 390, height: 844 };

async function expectNoViewportOverflow(page: Page): Promise<void> {
  const geometry = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    bodyScrollWidth: document.body.scrollWidth,
    rootScrollWidth: document.documentElement.scrollWidth,
  }));
  expect(geometry.bodyScrollWidth, 'body must not create page-level horizontal scrolling').toBeLessThanOrEqual(geometry.innerWidth + 1);
  expect(geometry.rootScrollWidth, 'document root must stay inside the phone viewport').toBeLessThanOrEqual(geometry.innerWidth + 1);
}

async function expectVisibleRegionsInsideViewport(page: Page, selectors: string[]): Promise<void> {
  for (const selector of selectors) {
    const regions = page.locator(`${selector}:visible`);
    for (let index = 0; index < await regions.count(); index += 1) {
      const box = await regions.nth(index).boundingBox();
      if (!box) continue;
      expect(box.x, `${selector} must not start outside the viewport`).toBeGreaterThanOrEqual(-1);
      expect(box.x + box.width, `${selector} must not spill past the viewport`).toBeLessThanOrEqual(PHONE.width + 1);
    }
  }
}

test.describe('Mobile content shell', () => {
  test.use({ viewport: PHONE });

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

authTest.describe('Mobile resource center', () => {
  authTest('keeps discovery shelves and resource filters inside a 390px viewport', async ({ authenticatedPage }) => {
    await authenticatedPage.setViewportSize(PHONE);
    await authenticatedPage.goto('/resources', { waitUntil: 'domcontentloaded', timeout: 60_000 });

    await expect(authenticatedPage.locator('main')).toBeVisible();
    await expectNoViewportOverflow(authenticatedPage);
    await expectVisibleRegionsInsideViewport(authenticatedPage, ['main > *', 'main form', 'main [role="navigation"]']);

    const undersizedFilterControls = await authenticatedPage.locator('main form input:visible, main form select:visible, main form button:visible').evaluateAll((controls) => controls
      .map((control) => {
        const rect = control.getBoundingClientRect();
        return { text: control.textContent?.trim() || '', width: rect.width, height: rect.height };
      })
      .filter((item) => item.width > 0 && item.height > 0 && item.height < 40));
    expect(undersizedFilterControls, 'resource filters should remain touch-sized on phones').toEqual([]);
  });

  authTest('map and schematic submission workbenches remain usable at phone width', async ({ authenticatedPage }) => {
    await authenticatedPage.setViewportSize(PHONE);
    for (const route of ['/resources/submit/map', '/resources/submit/schematic']) {
      await authenticatedPage.goto(route, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await expect(authenticatedPage.locator('main form')).toBeVisible();
      await expectNoViewportOverflow(authenticatedPage);
      await expectVisibleRegionsInsideViewport(authenticatedPage, ['main form', 'main form > *', 'main form section']);

      const narrowFields = await authenticatedPage.locator('main form input:visible, main form textarea:visible, main form select:visible').evaluateAll((fields) => fields
        .map((field) => {
          const rect = field.getBoundingClientRect();
          return { width: rect.width, right: rect.right };
        })
        .filter((field) => field.width > 0 && field.right > window.innerWidth + 1));
      expect(narrowFields, `${route} form fields must stay inside the phone viewport`).toEqual([]);
    }
  });
});

adminTest.describe('Mobile resource operations', () => {
  adminTest('resource operations remain usable without desktop-table overflow', async ({ authenticatedPage }) => {
    await authenticatedPage.setViewportSize(PHONE);
    await authenticatedPage.goto('/admin/resources', { waitUntil: 'domcontentloaded', timeout: 60_000 });

    await expect(authenticatedPage.locator('main')).toBeVisible();
    await expectNoViewportOverflow(authenticatedPage);
    await expectVisibleRegionsInsideViewport(authenticatedPage, ['main > *', 'main form']);

    const visibleTables = authenticatedPage.locator('main table:visible');
    for (let index = 0; index < await visibleTables.count(); index += 1) {
      const box = await visibleTables.nth(index).boundingBox();
      if (!box) continue;
      expect(box.width, 'visible admin tables must fit the phone viewport or be replaced by cards').toBeLessThanOrEqual(PHONE.width + 1);
    }
  });

  adminTest('operation audit filters and results stay inside the phone viewport', async ({ authenticatedPage }) => {
    await authenticatedPage.setViewportSize(PHONE);
    await authenticatedPage.goto('/admin/logs', { waitUntil: 'domcontentloaded', timeout: 60_000 });

    await expect(authenticatedPage.locator('main')).toBeVisible();
    await expectNoViewportOverflow(authenticatedPage);
    await expectVisibleRegionsInsideViewport(authenticatedPage, ['main > *', 'main form']);

    const controls = authenticatedPage.locator('main form input:visible, main form select:visible, main form button:visible');
    for (let index = 0; index < await controls.count(); index += 1) {
      const box = await controls.nth(index).boundingBox();
      if (!box || box.width === 0 || box.height === 0) continue;
      expect(box.height, 'audit filter controls should be touch-sized').toBeGreaterThanOrEqual(40);
    }
  });
});
