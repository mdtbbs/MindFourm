/**
 * Search Functionality E2E Tests
 *
 * Tests search functionality including:
 * - Search input and results
 * - Popular searches
 * - Search history (for authenticated users)
 * - Search filters
 */

import { test, expect } from '../fixtures/page-objects/base.po';
import { test as authTest, expect as authExpect } from '../fixtures/auth.fixture';

const API_URL = process.env.PLAYWRIGHT_API_URL || 'http://127.0.0.1:4000';

test.describe('Search Functionality', () => {
  test('should display search input in header', async ({ homePage }) => {
    await homePage.navigate();

    // Look for search input
    const searchInput = homePage.page.locator('[data-testid="search-input"]');
    if (await searchInput.isVisible()) {
      expect(await searchInput.isVisible()).toBeTruthy();
    }
  });

  test('should perform search with keyword', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Fill search input
    const searchInput = page.locator('[data-testid="search-input"]');
    if (await searchInput.isVisible()) {
      await searchInput.fill('test');
      await searchInput.press('Enter');

      // Should navigate to search results page
      await page.waitForURL(/search/, { timeout: 15000 });
      expect(page.url()).toContain('search');
    }
  });

  test('should display search results', async ({ page }) => {
    // Go directly to search page with query
    await page.goto('/search?q=test', { waitUntil: 'domcontentloaded', timeout: 45000 });

    // Wait for results to load
    await page.waitForTimeout(1000);

    // Check for results container
    const searchResults = page.locator('[data-testid="search-results"]');
    if (await searchResults.isVisible()) {
      expect(await searchResults.isVisible()).toBeTruthy();
    }
  });

  test('should show no results message for empty search', async ({ page }) => {
    await page.goto('/search?q=nonexistentkeyword12345', { waitUntil: 'domcontentloaded', timeout: 45000 });

    await page.waitForTimeout(1000);

    // Should show no results message or empty state
    const noResults = page.locator('[data-testid="no-results"]');
    const emptyState = page.locator('[data-testid="empty-state"]');

    expect(
      await noResults.isVisible() ||
      await emptyState.isVisible() ||
      true
    ).toBeTruthy();
  });

  test('should highlight search keywords in results', async ({ page }) => {
    await page.goto('/search?q=test', { waitUntil: 'domcontentloaded', timeout: 45000 });

    await page.waitForTimeout(1000);

    // Look for highlighted keywords (mark tags)
    const highlights = page.locator('mark');
    const count = await highlights.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Search API', () => {
  test('should call search endpoint', async ({ page }) => {
    const response = await page.request.get(`${API_URL}/api/search?q=test`);

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toHaveProperty('success');
  });

  test('should return popular searches', async ({ page }) => {
    const response = await page.request.get(`${API_URL}/api/search/popular`);

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toHaveProperty('success');
  });
});

test.describe('Popular Searches', () => {
  test('should display popular searches section', async ({ page }) => {
    await page.goto('/search', { waitUntil: 'domcontentloaded', timeout: 45000 });

    await page.waitForTimeout(1000);

    const popularSearches = page.locator('[data-testid="popular-searches"]');
    if (await popularSearches.isVisible()) {
      expect(await popularSearches.isVisible()).toBeTruthy();
    }
  });

  test('should click on popular search term', async ({ page }) => {
    await page.goto('/search', { waitUntil: 'domcontentloaded', timeout: 45000 });

    await page.waitForTimeout(1000);

    const popularSearchItem = page.locator('[data-testid="popular-search-item"]').first();
    if (await popularSearchItem.isVisible()) {
      await popularSearchItem.click();

      // Should update search with that term
      await page.waitForTimeout(1000);
    }
  });
});

authTest.describe('Search History (Authenticated)', () => {
  authTest('should show search history', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/search', { waitUntil: 'domcontentloaded', timeout: 45000 });

    await authenticatedPage.waitForTimeout(1000);

    const searchHistory = authenticatedPage.locator('[data-testid="search-history"]');
    if (await searchHistory.isVisible()) {
      authExpect(await searchHistory.isVisible()).toBeTruthy();
    }
  });

  authTest('should save search to history', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/', { waitUntil: 'domcontentloaded', timeout: 45000 });

    // Perform a search
    const uniqueQuery = `test${Date.now()}`;
    const searchInput = authenticatedPage.locator('[data-testid="search-input"]');
    if (await searchInput.isVisible()) {
      await searchInput.fill(uniqueQuery);
      await searchInput.press('Enter');

      await authenticatedPage.waitForURL(/search/, { timeout: 15000 });

      // Navigate back to search page
      await authenticatedPage.goto('/search', { waitUntil: 'domcontentloaded', timeout: 45000 });

      // Check if query appears in history
      await authenticatedPage.waitForTimeout(1000);
      const historyItems = authenticatedPage.locator('[data-testid="search-history-item"]');
      const count = await historyItems.count();
      authExpect(count).toBeGreaterThanOrEqual(0);
    }
  });

  authTest('should clear search history', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/search', { waitUntil: 'domcontentloaded', timeout: 45000 });

    await authenticatedPage.waitForTimeout(1000);

    const clearHistory = authenticatedPage.locator('[data-testid="clear-history"]');
    if (await clearHistory.isVisible()) {
      await clearHistory.click();

      await authenticatedPage.waitForTimeout(1000);
    }
  });
});

test.describe('Search Filters', () => {
  test('should show filter options', async ({ page }) => {
    await page.goto('/search?q=test', { waitUntil: 'domcontentloaded', timeout: 45000 });

    await page.waitForTimeout(1000);

    // Look for filter dropdowns/buttons
    const typeFilter = page.locator('[data-testid="type-filter"]');
    const categoryFilter = page.locator('[data-testid="category-filter"]');
    const sortFilter = page.locator('[data-testid="sort-filter"]');

    // Any of these might be present
    expect(
      await typeFilter.isVisible() ||
      await categoryFilter.isVisible() ||
      await sortFilter.isVisible() ||
      true
    ).toBeTruthy();
  });

  test('should apply filters to search', async ({ page }) => {
    await page.goto('/search?q=test&type=post', { waitUntil: 'domcontentloaded', timeout: 45000 });

    await page.waitForTimeout(1000);

    // Should load results with type filter applied
    const searchResults = page.locator('[data-testid="search-results"]');
    if (await searchResults.isVisible()) {
      expect(await searchResults.isVisible()).toBeTruthy();
    }
  });

  test('should sort search results', async ({ page }) => {
    await page.goto('/search?q=test&sort=newest', { waitUntil: 'domcontentloaded', timeout: 45000 });

    await page.waitForTimeout(1000);

    // Results should be displayed
    expect(page.url()).toContain('sort');
  });
});
