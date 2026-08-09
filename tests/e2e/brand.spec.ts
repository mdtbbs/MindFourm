/**
 * Brand Consistency – E2E Tests
 *
 * Verifies that site branding (name, logo, favicon) renders consistently
 * across all major page types and that the public settings API supplies
 * the brand fields the frontend needs.
 *
 * These tests require the dev servers (backend + frontend) to be running.
 */

import { test, expect } from '../fixtures/page-objects/base.po';

const API_URL = process.env.PLAYWRIGHT_API_URL || 'http://127.0.0.1:4000';

// Pages that should display the brand in the header / sidebar.
// Using public routes only — no authentication required.
const BRAND_PAGES = [
  { path: '/', label: 'Home' },
  { path: '/resources', label: 'Resources' },
  { path: '/about', label: 'About' },
];

test.describe('Public Settings API', () => {
  test('GET /api/settings returns brand fields with stable shape', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/settings`);
    expect(response.ok()).toBeTruthy();

    const body = await response.json();

    // The response is wrapped by ResponseInterceptor: { success, data }
    const data = body.data ?? body;

    // All six brand fields must be present
    const brandFields = [
      'site_name',
      'site_tagline',
      'site_description',
      'site_logo_url',
      'site_favicon_url',
      'sidebar_title',
    ];

    for (const field of brandFields) {
      expect(data).toHaveProperty(field);
    }

    // Secrets must never leak
    expect(data).not.toHaveProperty('smtp_password');
    expect(data).not.toHaveProperty('admin_notifications_webhook_secret');
  });

  test('GET /api/settings/brand returns only public brand keys', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/settings/brand`);
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    const data = body.data ?? body;

    // Should only contain keys that are in the PUBLIC_KEYS allowlist
    expect(data).toHaveProperty('site_name');

    // Must not contain secrets
    expect(data).not.toHaveProperty('smtp_password');
    expect(data).not.toHaveProperty('smtp_host');
    expect(data).not.toHaveProperty('admin_notifications_webhook_secret');
  });
});

test.describe('Brand Consistency Across Pages', () => {
  test('header displays the site brand on all public pages', async ({ page }) => {
    // First, fetch the expected brand name from the API
    const settingsResponse = await page.request.get(`${API_URL}/api/settings`);
    const settingsBody = await settingsResponse.json();
    const settings = settingsBody.data ?? settingsBody;
    const expectedName = settings.site_name || '社区论坛';

    for (const { path, label } of BRAND_PAGES) {
      await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 60000 });

      // The header should be visible on every page
      const header = page.locator('header');
      await expect(header).toBeVisible({ timeout: 10000 });

      // The header should contain a link to home with the brand
      const brandLink = page.locator('header a[href="/"]');
      await expect(brandLink).toBeVisible({ timeout: 5000 });

      // The brand text or logo should be present inside the link
      const brandContent = brandLink.locator('img, span');
      const count = await brandContent.count();
      expect(count).toBeGreaterThan(0);

      // The brand link should display the configured brand name
      await expect(brandLink).toContainText(expectedName);

      // If it's an image, it should have an alt attribute matching the site name
      const logoImg = brandLink.locator('img');
      if (await logoImg.isVisible().catch(() => false)) {
        const alt = await logoImg.getAttribute('alt');
        expect(alt).toBeTruthy();
      }
    }
  });

  test('sidebar displays brand name on desktop-width pages', async ({ page }) => {
    // Set a desktop viewport so the sidebar is visible (lg: breakpoint)
    await page.setViewportSize({ width: 1280, height: 800 });

    const settingsResponse = await page.request.get(`${API_URL}/api/settings`);
    const settingsBody = await settingsResponse.json();
    const settings = settingsBody.data ?? settingsBody;
    const expectedName = settings.site_name || '社区论坛';

    for (const { path, label } of BRAND_PAGES) {
      await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 60000 });

      // Sidebar is <aside> and only visible at lg+ breakpoints
      const sidebar = page.locator('aside');
      if (await sidebar.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Sidebar should contain a brand link
        const sidebarBrand = sidebar.locator('a[href="/"]');
        await expect(sidebarBrand).toBeVisible({ timeout: 5000 });

        // Sidebar should display the site name (truncated text)
        const sidebarText = sidebar.locator('a[href="/"]');
        const text = await sidebarBrand.textContent();
        expect(text).toBeTruthy();
        expect(text).toContain(expectedName);
      }
    }
  });

  test('favicon link tag is present in page head', async ({ page }) => {
    for (const { path, label } of BRAND_PAGES) {
      await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 60000 });

      // Check for favicon link tag
      const favicon = page.locator('link[rel="icon"]');
      const count = await favicon.count();
      expect(count).toBeGreaterThan(0);

      // The href should not be empty
      const href = await favicon.getAttribute('href');
      expect(href).toBeTruthy();
      expect(href!.length).toBeGreaterThan(0);
    }
  });

  test('page title contains the site name', async ({ page }) => {
    const settingsResponse = await page.request.get(`${API_URL}/api/settings`);
    const settingsBody = await settingsResponse.json();
    const settings = settingsBody.data ?? settingsBody;
    const expectedName = settings.site_name || '社区论坛';

    // Check the home page title
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    const title = await page.title();
    expect(title).toBeTruthy();
    // The title should contain the site name (possibly with a suffix)
    expect(title).toContain(expectedName);
  });
});

test.describe('Brand Fallback Behavior', () => {
  test('renders gracefully when logo is empty (text fallback)', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Even without a custom logo, the header brand link should render
    const brandLink = page.locator('header a[href="/"]');
    await expect(brandLink).toBeVisible({ timeout: 10000 });

    // Should have some content (text or image)
    const brandContent = brandLink.locator('img, span');
    const count = await brandContent.count();
    expect(count).toBeGreaterThan(0);
  });

  test('page does not block rendering due to settings fetch', async ({ page }) => {
    // Navigate to the home page and verify it loads within a reasonable time
    const startTime = Date.now();
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    const loadTime = Date.now() - startTime;

    // Page should load in under 10 seconds (generous threshold for CI)
    expect(loadTime).toBeLessThan(10000);

    // Header should be visible, confirming the page rendered
    const header = page.locator('header');
    await expect(header).toBeVisible({ timeout: 5000 });
  });
});
