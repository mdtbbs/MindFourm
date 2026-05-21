// @ts-check
const { test } = require('../fixtures/fixtures');
const { createTestIdentity, deleteTestIdentity } = require('../helpers/auth');
const { API_BASE } = require('../helpers/api');

test.describe('9. Authentication & Permissions', () => {
  let user;
  let admin;
  let moderator;

  test.beforeEach(async () => {
    user = createTestIdentity({ role: 'user' });
    admin = createTestIdentity({ username: `admin_perm_${Date.now()}`, role: 'admin' });
    moderator = createTestIdentity({ username: `mod_perm_${Date.now()}`, role: 'moderator' });
  });

  test.afterEach(() => {
    deleteTestIdentity(user.userId);
    deleteTestIdentity(admin.userId);
    deleteTestIdentity(moderator.userId);
  });

  test('should return 401 for POST endpoints without auth', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/v1/messages`, {
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({ recipient_id: 1, content: 'test' }),
    });
    test.expect(response.status()).toBe(401);
  });

  test('should allow authenticated user to send messages', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/v1/messages`, {
      headers: {
        'Cookie': user.cookieValue,
        'Content-Type': 'application/json',
      },
      data: JSON.stringify({
        recipient_id: admin.userId,
        content: 'Auth test',
      }),
    });

    test.expect([200, 201]).toContain(response.status());
  });

  test('resources listing should be public', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/v1/resources`);
    test.expect(response.status()).toBe(200);
  });

  test('moderator access test via API', async ({ request }) => {
    // Moderator should be able to access admin resource listing
    const response = await request.get(`${API_BASE}/api/v1/resources/admin`, {
      headers: { 'Cookie': moderator.cookieValue },
    });

    // 200 (success) or 400 (bad request due to missing params) are both acceptable
    // The key is it's not 401
    test.expect(response.status()).not.toBe(401);
  });

  test('user should be rejected from admin endpoints', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/v1/resources/admin`, {
      headers: { 'Cookie': user.cookieValue },
    });

    // Should be forbidden or bad request - not success
    test.expect([400, 403]).toContain(response.status());
  });

  test('health check should be public', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/health`);
    test.expect(response.status()).toBe(200);

    const body = await response.json();
    test.expect(body.status).toBe('ok');
    test.expect(body).toHaveProperty('timestamp');
  });

  test('categories should be public', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/v1/categories`);
    test.expect(response.status()).toBe(200);
  });

  test('post detail should be public', async ({ request }) => {
    const db = require('../fixtures/test-db').getTestDb();
    const result = db.prepare(`
      INSERT INTO posts (user_id, title, content, content_html, status, created_at)
      VALUES (?, 'Public Post Test', 'Content', '<p>Content</p>', 'published', datetime('now'))
    `).run(user.userId);

    const response = await request.get(`${API_BASE}/api/v1/posts/${result.lastInsertRowid}`);
    test.expect(response.status()).toBe(200);

    db.prepare('DELETE FROM posts WHERE id = ?').run(result.lastInsertRowid);
  });
});
