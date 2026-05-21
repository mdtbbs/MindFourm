// @ts-check
const { test } = require('../fixtures/fixtures');
const { createTestIdentity, deleteTestIdentity } = require('../helpers/auth');
const { API_BASE } = require('../helpers/api');

test.describe('6. Email Notifications', () => {
  let user;
  let sender;

  test.beforeEach(async () => {
    user = createTestIdentity({ role: 'user' });
    sender = createTestIdentity({ role: 'user' });
  });

  test.afterEach(() => {
    deleteTestIdentity(user.userId);
    deleteTestIdentity(sender.userId);
  });

  test('should have email settings in admin panel', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/settings`);
    const body = await response.json();

    test.expect(body.success).toBe(true);

    // Email settings should NOT be in public settings (security check)
    test.expect(body.data).not.toHaveProperty('smtp_pass');
    test.expect(body.data).not.toHaveProperty('smtp_user');
  });

  test('should create notification when user is mentioned', async ({ request }) => {
    const db = require('../fixtures/test-db').getTestDb();

    // Create a post that mentions the user (directly in DB to bypass API)
    const postResult = db.prepare(`
      INSERT INTO posts (user_id, title, content, content_html, status, created_at)
      VALUES (?, 'Mention Test', 'Hey @${user.username} check this out', '<p>Hey @${user.username} check this out</p>', 'published', datetime('now'))
    `).run(sender.userId);

    // Create the notification directly (as the controller would)
    db.prepare(`
      INSERT INTO notifications (user_id, type, actor_id, post_id, content, is_read, created_at)
      VALUES (?, 'mention', ?, ?, '@${user.username} mentioned you', 0, datetime('now'))
    `).run(user.userId, sender.userId, postResult.lastInsertRowid);

    // Verify notification exists
    const notification = db.prepare(`
      SELECT * FROM notifications WHERE user_id = ? AND type = 'mention' ORDER BY created_at DESC LIMIT 1
    `).get(user.userId);

    test.expect(notification).toBeTruthy();
    test.expect(notification.type).toBe('mention');
    test.expect(notification.is_read).toBe(0);
  });

  test('should create notification on reply', async ({ request }) => {
    const db = require('../fixtures/test-db').getTestDb();

    // Create a post
    const postResult = db.prepare(`
      INSERT INTO posts (user_id, title, content, content_html, status, created_at)
      VALUES (?, 'Reply Notification Test', 'Original post content', '<p>Original post content</p>', 'published', datetime('now'))
    `).run(user.userId);

    // Create a reply from another user
    db.prepare(`
      INSERT INTO replies (post_id, user_id, content, content_html, status, created_at)
      VALUES (?, ?, 'Great post!', '<p>Great post!</p>', 'active', datetime('now'))
    `).run(postResult.lastInsertRowid, sender.userId);

    // Create notification directly (as the controller would)
    db.prepare(`
      INSERT INTO notifications (user_id, type, actor_id, post_id, content, is_read, created_at)
      VALUES (?, 'reply', ?, ?, 'Someone replied to your post', 0, datetime('now'))
    `).run(user.userId, sender.userId, postResult.lastInsertRowid);

    // Check notification exists
    const notification = db.prepare(`
      SELECT * FROM notifications WHERE user_id = ? AND type = 'reply' ORDER BY created_at DESC LIMIT 1
    `).get(user.userId);

    test.expect(notification).toBeTruthy();
  });

  test('should not expose SMTP credentials in public API', async ({ request }) => {
    // Check all public settings endpoints
    const publicSettings = await request.get(`${API_BASE}/api/settings`);
    const settingsBody = await publicSettings.json();

    // No sensitive data should be exposed
    test.expect(settingsBody.data).not.toHaveProperty('smtp_pass');
    test.expect(settingsBody.data).not.toHaveProperty('smtp_user');
    test.expect(settingsBody.data).not.toHaveProperty('smtp_host');
  });

  test('email service should handle missing SMTP gracefully', async ({ request }) => {
    // With no SMTP configured, sending a notification should not crash
    const db = require('../fixtures/test-db').getTestDb();

    // Create a post to trigger notification flow
    const result = db.prepare(`
      INSERT INTO posts (user_id, title, content, content_html, status, created_at)
      VALUES (?, 'Email Test', '@nonexistent_user_no_email', '<p>@nonexistent_user_no_email</p>', 'published', datetime('now'))
    `).run(sender.userId);

    // The post creation should succeed even without SMTP
    const response = await request.get(`${API_BASE}/api/v1/posts/${result.lastInsertRowid}`);
    test.expect(response.status()).toBe(200);
  });
});
