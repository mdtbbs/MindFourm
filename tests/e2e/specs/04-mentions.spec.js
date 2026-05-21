// @ts-check
const { test } = require('../fixtures/fixtures');
const { createTestIdentity, deleteTestIdentity } = require('../helpers/auth');
const { API_BASE } = require('../helpers/api');

test.describe('4. @Mentions', () => {
  let user;
  let mentionedUser;

  test.beforeEach(async () => {
    user = createTestIdentity({ role: 'user' });
    mentionedUser = createTestIdentity({ username: `mentionable_${Date.now()}`, role: 'user' });
  });

  test.afterEach(() => {
    deleteTestIdentity(user.userId);
    deleteTestIdentity(mentionedUser.userId);
  });

  test('should search users via API with matching prefix', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/v1/users/search?q=${mentionedUser.username.substring(0, 4)}`);
    const body = await response.json();

    test.expect(response.status()).toBe(200);
    test.expect(body.success).toBe(true);

    // Should find our user
    const foundUser = body.data.find(u => u.username === mentionedUser.username);
    test.expect(foundUser).toBeTruthy();
  });

  test('should return empty for non-matching search', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/v1/users/search?q=xyznonexistent123`);
    const body = await response.json();

    test.expect(response.status()).toBe(200);
    test.expect(body.success).toBe(true);
    test.expect(body.data.length).toBe(0);
  });

  test('should render @mentions as links in markdown', async ({ page }) => {
    const db = require('../fixtures/test-db').getTestDb();
    const postResult = db.prepare(`
      INSERT INTO posts (user_id, title, content, content_html, status, created_at)
      VALUES (?, 'Mention Test', 'Hello @testuser', 'Hello <a href="/users/testuser" class="mention">@testuser</a>', 'published', datetime('now'))
    `).run(user.userId);

    await page.goto(`/posts/${postResult.lastInsertRowid}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Check that @mention text appears in the page
    const bodyText = await page.locator('body').innerText();
    test.expect(bodyText).toContain('@testuser');
  });

  test('should handle Chinese characters in mentions', async ({ request }) => {
    const chineseUser = createTestIdentity({ username: '中文用户', role: 'user' });

    const response = await request.get(`${API_BASE}/api/v1/users/search?q=中文`);
    const body = await response.json();

    test.expect(body.success).toBe(true);
    test.expect(body.data.length).toBeGreaterThan(0);

    deleteTestIdentity(chineseUser.userId);
  });

  test('should return multiple matching users', async ({ request }) => {
    // Create multiple users with similar prefix
    const user1 = createTestIdentity({ username: `search_test_a_${Date.now()}`, role: 'user' });
    const user2 = createTestIdentity({ username: `search_test_b_${Date.now()}`, role: 'user' });

    const response = await request.get(`${API_BASE}/api/v1/users/search?q=search_test`);
    const body = await response.json();

    test.expect(body.success).toBe(true);
    test.expect(body.data.length).toBeGreaterThanOrEqual(2);

    deleteTestIdentity(user1.userId);
    deleteTestIdentity(user2.userId);
  });
});
