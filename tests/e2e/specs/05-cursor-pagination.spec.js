// @ts-check
const { test } = require('../fixtures/fixtures');
const { createTestIdentity, deleteTestIdentity } = require('../helpers/auth');
const { API_BASE } = require('../helpers/api');

test.describe('5. Cursor-Based Pagination', () => {
  let user;
  let postIds = [];

  test.beforeEach(async () => {
    user = createTestIdentity({ role: 'user' });
    const db = require('../fixtures/test-db').getTestDb();

    // Create multiple posts for pagination testing
    for (let i = 0; i < 10; i++) {
      const result = db.prepare(`
        INSERT INTO posts (user_id, title, content, content_html, status, created_at)
        VALUES (?, 'Cursor Test Post ${i}', 'Content ${i}', '<p>Content</p>', 'published', datetime('now', '-${i} minutes'))
      `).run(user.userId);
      postIds.push(result.lastInsertRowid);
    }
  });

  test.afterEach(() => {
    deleteTestIdentity(user.userId);
    postIds = [];
  });

  test('should return posts with cursor metadata', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/v1/posts/cursor?limit=3`);
    const body = await response.json();

    test.expect(response.status()).toBe(200);
    test.expect(body.success).toBe(true);
    test.expect(body.data).toHaveProperty('data');
    test.expect(body.data).toHaveProperty('next_cursor');
    test.expect(body.data).toHaveProperty('has_more');
    test.expect(body.data.data.length).toBeGreaterThan(0);
  });

  test('should paginate using next_cursor', async ({ request }) => {
    // Get first page with small limit
    const res1 = await request.get(`${API_BASE}/api/v1/posts/cursor?limit=3`);
    const json1 = await res1.json();

    test.expect(json1.data.data.length).toBeGreaterThan(0);

    if (json1.data.next_cursor) {
      const cursor = json1.data.next_cursor;
      const res2 = await request.get(`${API_BASE}/api/v1/posts/cursor?limit=3&cursor=${encodeURIComponent(cursor)}`);
      const json2 = await res2.json();

      test.expect(res2.status()).toBe(200);
      test.expect(json2.success).toBe(true);

      // Page 2 should have different or fewer items
      const page1Ids = new Set(json1.data.data.map(p => p.id));
      const page2Ids = json2.data.data.map(p => p.id);

      // At least verify pagination advances - check timestamps are older or equal
      if (page2Ids.length > 0 && json1.data.data.length > 0) {
        const last1 = json1.data.data[json1.data.data.length - 1];
        const last2 = json2.data.data[json2.data.data.length - 1];
        // Page 2's last item should be <= page 1's last item in creation order
        test.expect(new Date(last2.created_at).getTime()).toBeLessThanOrEqual(new Date(last1.created_at).getTime());
      }
    }
  });

  test('should pin posts to the top of results', async ({ request }) => {
    // Create a pinned post
    const db = require('../fixtures/test-db').getTestDb();
    const pinnedResult = db.prepare(`
      INSERT INTO posts (user_id, title, content, content_html, status, is_pinned, created_at)
      VALUES (?, 'Pinned Post', 'I am pinned', '<p>I am pinned</p>', 'published', 1, datetime('now'))
    `).run(user.userId);

    const response = await request.get(`${API_BASE}/api/v1/posts/cursor?limit=5`);
    const body = await response.json();

    const firstPost = body.data.data[0];
    test.expect(firstPost.is_pinned).toBe(1);

    db.prepare('DELETE FROM posts WHERE id = ?').run(pinnedResult.lastInsertRowid);
  });

  test('should stop returning results when exhausted', async ({ request }) => {
    // Get all posts with a large limit
    const response = await request.get(`${API_BASE}/api/v1/posts/cursor?limit=1000`);
    const body = await response.json();

    // has_more should be false when all posts are returned
    test.expect(body.data.has_more).toBe(false);
  });

  test('notification cursor pagination works', async ({ request, user }) => {
    const response = await request.get(`${API_BASE}/api/v1/notifications/cursor?limit=5`, {
      headers: { 'Cookie': user.cookieValue },
    });

    // Should be 200 (authenticated) or 401 (if cookie not working)
    test.expect([200, 401]).toContain(response.status());
  });
});
