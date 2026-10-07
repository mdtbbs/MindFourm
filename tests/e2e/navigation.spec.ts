/**
 * Frontend IA 2.0 navigation smoke tests.
 * These tests require the frontend and backend dev servers to be running.
 */

import { test, expect } from '../fixtures/page-objects/base.po';
import { test as authTest, adminTest } from '../fixtures/auth.fixture';

const API_URL = process.env.PLAYWRIGHT_API_URL || 'http://127.0.0.1:4000';
const SPACE_ROUTES = ['/', '/community', '/resources', '/multiplayer', '/tools', '/me'];

test.describe('Sidebar Navigation API', () => {
  test('GET /api/settings/admin/sidebar-navigation returns an array or requires auth', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/settings/admin/sidebar-navigation`);
    expect([200, 401, 403]).toContain(response.status());
    if (response.status() === 200) {
      const body = await response.json();
      expect(Array.isArray(body.data ?? body)).toBeTruthy();
    }
  });

  test('PUT /api/settings/admin/sidebar-navigation requires auth', async ({ request }) => {
    const response = await request.put(`${API_URL}/api/settings/admin/sidebar-navigation`, {
      data: { items: [] },
      headers: { 'Content-Type': 'application/json' },
    });
    expect([401, 403]).toContain(response.status());
  });
});

test.describe('Desktop IA navigation', () => {
  test('sidebar presents the six stable user spaces in order', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 });

    const sidebar = page.getByTestId('content-sidebar');
    await expect(sidebar).toBeVisible();
    const links = sidebar.getByRole('navigation').getByRole('link');
    await expect(links).toHaveCount(6);
    await expect(links.evaluateAll((items) => items.map((item) => item.getAttribute('href')))).resolves.toEqual(SPACE_ROUTES);
  });

  test('active state follows the current workspace and provides a breadcrumb', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/community', { waitUntil: 'domcontentloaded', timeout: 60000 });

    await expect(page.getByTestId('sidebar-nav').getByRole('link', { name: '社区' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('navigation', { name: '页面位置' })).toContainText('社区');
  });

  test('search and create remain global topbar actions', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await expect(page.getByTestId('global-search-trigger-desktop')).toBeVisible();
    await expect(page.getByRole('button', { name: '创建' })).toBeVisible();
  });
});

test.describe('Mobile IA navigation', () => {
  test('bottom navigation has five stable spaces and no desktop sidebar or drawer', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 });

    const nav = page.getByTestId('mobile-bottom-navigation');
    await expect(nav).toBeVisible();
    const links = nav.getByRole('link');
    await expect(links).toHaveCount(5);
    await expect(links.evaluateAll((items) => items.map((item) => item.getAttribute('href')))).resolves.toEqual(['/', '/community', '/resources', '/multiplayer', '/me']);
    await expect(page.getByTestId('content-sidebar')).toBeHidden();
    await expect(page.getByTestId('mobile-menu-button')).toHaveCount(0);
    await expect(page.getByTestId('global-search-trigger-mobile')).toBeVisible();
    await expect(page.getByRole('button', { name: '创建' })).toBeVisible();
  });

  test('global search finds cloud saves and follows its protected route', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.getByTestId('global-search-trigger-mobile').click();
    const dialog = page.getByRole('dialog', { name: '全局搜索' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('combobox').fill('云存档');
    const cloudSaves = dialog.getByRole('option', { name: /云存档/ });
    await expect(cloudSaves).toBeVisible();
    await cloudSaves.click();
    await expect(page).toHaveURL(/\/login\?redirect=.*tools%2Fcloud-saves/);
  });
});

test('the retired user cloud-save URL returns 404 without a compatibility redirect', async ({ page }) => {
  const response = await page.goto('/settings/cloud-saves', { waitUntil: 'domcontentloaded', timeout: 60000 });
  expect(response?.status()).toBe(404);
  await expect(page).not.toHaveURL(/\/login/);
});

authTest('authenticated creation menu exposes resource upload shortcuts', async ({ authenticatedPage }) => {
  await authenticatedPage.setViewportSize({ width: 390, height: 844 });
  await authenticatedPage.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await authenticatedPage.getByRole('button', { name: '创建' }).click();

  const dialog = authenticatedPage.getByRole('dialog', { name: '创建' });
  await expect(dialog.getByRole('link', { name: /上传蓝图/ })).toHaveAttribute('href', '/resources/submit/schematic');
  await expect(dialog.getByRole('link', { name: /上传地图/ })).toHaveAttribute('href', '/resources/submit/map');
  await authenticatedPage.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

authTest('developer center is discoverable to a regular user but admin entry is hidden', async ({ authenticatedPage }) => {
  await authenticatedPage.setViewportSize({ width: 1280, height: 800 });
  await authenticatedPage.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await authenticatedPage.locator('header details summary').click();
  const menu = authenticatedPage.getByRole('menu');
  await expect(menu.getByRole('menuitem', { name: '开发者中心' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: '管理后台' })).toHaveCount(0);
});

adminTest('admin entry appears only in the authenticated admin user menu', async ({ authenticatedPage }) => {
  await authenticatedPage.setViewportSize({ width: 1280, height: 800 });
  await authenticatedPage.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await authenticatedPage.locator('header details summary').click();
  await expect(authenticatedPage.getByRole('menu').getByRole('menuitem', { name: '管理后台' })).toBeVisible();
});

test('anonymous visits to private workspace tools enter the login flow', async ({ page }) => {
  for (const route of ['/me', '/friends', '/resources/my', '/tools/cloud-saves']) {
    await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await expect(page).toHaveURL(new RegExp(`/login\\?redirect=.*${route.replaceAll('/', '%2F').slice(1)}`));
  }
});
