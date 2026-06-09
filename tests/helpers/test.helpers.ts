/**
 * Test Helpers
 *
 * Utility functions for E2E tests
 */

import { Page, APIRequestContext } from '@playwright/test';

/**
 * Wait for API response
 */
export async function waitForApiResponse(page: Page, endpoint: string): Promise<any> {
  const response = await page.waitForResponse(
    (resp) => resp.url().includes(endpoint) && resp.status() === 200
  );
  return response.json();
}

/**
 * Mock authenticated session (for testing)
 */
export async function mockSession(page: Page, userId: number): Promise<void> {
  // Set session cookie directly for testing
  // This requires backend to have test endpoints or mock session support
  await page.goto('/');
}

/**
 * Create test post via API
 */
export async function createTestPost(
  request: APIRequestContext,
  data: { title: string; content: string; category_id?: number }
): Promise<{ id: number }> {
  const response = await request.post('http://localhost:4000/api/posts', {
    data,
  });
  const result = await response.json();
  return result.data;
}

/**
 * Delete test post via API
 */
export async function deleteTestPost(
  request: APIRequestContext,
  postId: number
): Promise<void> {
  await request.delete(`http://localhost:4000/api/posts/${postId}`);
}

/**
 * Create test user via API (requires admin privileges)
 */
export async function createTestUser(
  request: APIRequestContext,
  data: { username: string; role: string }
): Promise<{ id: number }> {
  // This would typically be done through admin endpoints
  // Or through test seeding
  return { id: 0 };
}

/**
 * Generate unique test string
 */
export function generateTestString(prefix: string = 'test'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Check if element exists
 */
export async function elementExists(page: Page, selector: string): Promise<boolean> {
  const element = page.locator(selector);
  return await element.count() > 0;
}

/**
 * Get text content safely
 */
export async function getTextSafely(page: Page, selector: string): Promise<string | null> {
  const element = page.locator(selector);
  if (await element.count() > 0) {
    return await element.textContent();
  }
  return null;
}

/**
 * Wait for navigation and verify URL
 */
export async function waitForNavigation(page: Page, expectedUrlPattern: string): Promise<void> {
  await page.waitForURL(expectedUrlPattern, { timeout: 10000 });
}

/**
 * Take screenshot on failure
 */
export async function screenshotOnFailure(page: Page, testName: string): Promise<void> {
  await page.screenshot({ path: `./test-results/${testName}-failure.png` });
}

/**
 * Clear test data (cleanup)
 */
export async function cleanupTestData(request: APIRequestContext): Promise<void> {
  // Delete test posts, users, etc
  // This would typically be done through admin endpoints or database cleanup
}

/**
 * Login via test endpoint (if available)
 */
export async function testLogin(
  request: APIRequestContext,
  userType: 'admin' | 'moderator' | 'user'
): Promise<{ success: boolean }> {
  try {
    const response = await request.post('http://localhost:4000/api/auth/test-login', {
      data: { userType },
    });
    return await response.json();
  } catch {
    // Test endpoint not available
    return { success: false };
  }
}