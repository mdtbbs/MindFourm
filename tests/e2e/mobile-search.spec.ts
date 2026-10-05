import { test as authTest, expect } from '../fixtures/auth.fixture';

authTest.describe('Mobile search controls', () => {
  authTest('keeps the query editable, labelled, and at least 44px tall', async ({ authenticatedPage }) => {
    await authenticatedPage.setViewportSize({ width: 390, height: 844 });
    await authenticatedPage.goto('/search', { waitUntil: 'domcontentloaded' });
    await authenticatedPage.route('**/api/v1/search/suggestions?**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: ['resource query', 'resources'], meta: { request_id: 'mobile-search-test' } }),
    }));

    const query = authenticatedPage.locator('#search-query');
    await expect(query).toBeVisible();
    await expect(authenticatedPage.locator('label[for="search-query"]')).toBeVisible();
    await query.fill('resource query');
    await expect(query).toHaveValue('resource query');
    await expect(authenticatedPage.locator('#search-query-suggestions option')).toHaveCount(2);

    const controls = [
      query,
      authenticatedPage.locator('#search-sort'),
      authenticatedPage.locator('a[aria-current="page"]').first(),
      authenticatedPage.locator('form[action="/search"] button[type="submit"]'),
    ];
    for (const control of controls) {
      const box = await control.boundingBox();
      expect(box?.height || 0, `${await control.getAttribute('id') || 'search action'} must meet mobile touch sizing`).toBeGreaterThanOrEqual(44);
    }
  });
});
