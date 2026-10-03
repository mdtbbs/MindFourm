import { test, expect } from '@playwright/test';
import { adminTest, expect as adminExpect } from '../fixtures/auth.fixture';

const API_URL = process.env.PLAYWRIGHT_API_URL || 'http://127.0.0.1:4000';

test('Developer Center serves the Public V1 contract without private routes', async ({ request, page }) => {
  const response = await request.get(`${API_URL}/api/openapi/public-v1.json`);
  expect(response.ok()).toBeTruthy();
  const contract = await response.json();
  const paths = Object.keys(contract.paths || {});

  expect(paths).toContain('/v1/packs/{packId}/versions/{versionId}/manifest');
  expect(paths).toContain('/v1/packs/{packId}/versions/{versionId}/download-grants');
  expect(paths).not.toContain('/admin');
  expect(paths.some((path) => /(^|\/)(admin|internal)(\/|$)/i.test(path))).toBe(false);
  expect(paths.some((path) => path.includes('/relay-agent/'))).toBe(false);

  await page.goto('/api/v1', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).toContainText('MDTBBS API');
  await expect(page.locator('body')).toContainText('Install a Pack');
});

adminTest('staff can open the Admin dashboard shell and navigation', async ({ authenticatedPage }) => {
  await authenticatedPage.goto('/admin', { waitUntil: 'domcontentloaded' });
  await adminExpect(authenticatedPage.locator('[data-testid="admin-sidebar"]')).toBeVisible();
  await adminExpect(authenticatedPage.locator('.admin-content')).toBeVisible();
});
