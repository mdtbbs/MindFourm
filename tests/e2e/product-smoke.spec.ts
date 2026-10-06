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
  expect(paths).toEqual(expect.arrayContaining([
    '/v1/messages',
    '/v1/messages/unread-count',
    '/v1/messages/{userId}',
  ]));
  expect(contract.paths['/v1/messages'].get['x-required-scopes']).toContain('message.read');
  expect(contract.paths['/v1/messages'].post['x-required-scopes']).toContain('message.write');
  expect(contract.paths['/v1/messages'].get['x-rate-limit'].limit).toBe(60);
  expect(contract.paths['/v1/messages'].post['x-rate-limit'].limit).toBe(10);
  expect(Object.keys(contract.components.schemas.PatchSocialPrivacyDto.properties)).toContain('allow_messages');
  expect(JSON.stringify(contract.components.schemas)).toContain('documentation_url');
  expect(paths).not.toContain('/admin');
  expect(paths.some((path) => /(^|\/)(admin|internal)(\/|$)/i.test(path))).toBe(false);
  expect(paths.some((path) => path.includes('/relay-agent/'))).toBe(false);

  await page.goto('/api/v1', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).toContainText('MDTBBS 文档中心');
  await expect(page.locator('body')).toContainText(`API 契约${contract.info.version}`);
  await expect(page.locator('body')).toContainText(`Public API ${contract.info.version}`);
});

adminTest('staff can open the Admin dashboard shell and navigation', async ({ authenticatedPage }) => {
  await authenticatedPage.goto('/admin', { waitUntil: 'domcontentloaded' });
  await adminExpect(authenticatedPage.locator('.admin-v2-sidebar-stack')).toBeVisible();
  await adminExpect(authenticatedPage.locator('.admin-v2-workspace')).toBeVisible();
});
