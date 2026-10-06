import type { Page } from '@playwright/test';
import { test as authTest, adminTest, expect } from '../fixtures/auth.fixture';

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
    const regions = page.locator(selector).filter({ visible: true });
    for (let index = 0; index < await regions.count(); index += 1) {
      const box = await regions.nth(index).boundingBox();
      if (!box) continue;
      expect(box.x, `${selector} must not start outside the viewport`).toBeGreaterThanOrEqual(-1);
      expect(box.x + box.width, `${selector} must not spill past the viewport`).toBeLessThanOrEqual(PHONE.width + 1);
    }
  }
}

authTest.describe('Mobile resource center', () => {
  authTest('keeps discovery shelves and resource actions inside a 390px viewport', async ({ authenticatedPage }) => {
    await authenticatedPage.setViewportSize(PHONE);
    await authenticatedPage.goto('/resources', { waitUntil: 'domcontentloaded', timeout: 60_000 });

    await expect(authenticatedPage.locator('main')).toBeVisible();
    await expectNoViewportOverflow(authenticatedPage);
    await expectVisibleRegionsInsideViewport(authenticatedPage, ['main > *', 'main form', 'main [role="navigation"]']);

    const oversizedButtons = await authenticatedPage.locator('main button:visible').evaluateAll((buttons) => buttons
      .map((button) => {
        const rect = button.getBoundingClientRect();
        return { text: button.textContent?.trim() || '', width: rect.width, height: rect.height };
      })
      .filter((item) => item.width > 0 && item.height > 0 && item.height < 40));
    expect(oversizedButtons, 'primary resource controls should remain touch-sized on phones').toEqual([]);
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

    const controls = authenticatedPage.locator('main input:visible, main select:visible, main button:visible');
    for (let index = 0; index < await controls.count(); index += 1) {
      const box = await controls.nth(index).boundingBox();
      if (!box || box.width === 0 || box.height === 0) continue;
      expect(box.height, 'audit controls should be touch-sized').toBeGreaterThanOrEqual(40);
    }
  });
});
