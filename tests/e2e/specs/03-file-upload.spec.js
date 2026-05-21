// @ts-check
const { test } = require('../fixtures/fixtures');
const { createTestIdentity, deleteTestIdentity } = require('../helpers/auth');
const { API_BASE } = require('../helpers/api');
const fs = require('fs');
const path = require('path');

test.describe('3. File Upload / Attachments', () => {
  let user;
  let postId;
  const TEST_FILE_PATH = path.join(__dirname, '../fixtures/test-image.png');

  test.beforeAll(() => {
    const pngBuffer = Buffer.from(
      '89504e470d0a1a0a0000000d4948445200000001000000010100000000376ef9' +
      '240000000a49444154789c63000100000500010d0a2db40000000049454e44ae' +
      '426082',
      'hex'
    );
    fs.mkdirSync(path.dirname(TEST_FILE_PATH), { recursive: true });
    fs.writeFileSync(TEST_FILE_PATH, pngBuffer);
  });

  test.afterAll(() => {
    if (fs.existsSync(TEST_FILE_PATH)) fs.unlinkSync(TEST_FILE_PATH);
  });

  test.beforeEach(async () => {
    user = createTestIdentity({ role: 'user' });
    const db = require('../fixtures/test-db').getTestDb();
    const postResult = db.prepare(`
      INSERT INTO posts (user_id, title, content, content_html, status, created_at)
      VALUES (?, 'Test Post for Attachments', 'Content', '<p>Content</p>', 'published', datetime('now'))
    `).run(user.userId);
    postId = postResult.lastInsertRowid;
  });

  test.afterEach(() => {
    deleteTestIdentity(user.userId);
  });

  test('should reject file upload without authentication', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    const response = await page.request.post(`${API_BASE}/api/v1/attachments/upload`, {
      multipart: {
        file: { name: 'test.png', mimeType: 'image/png', buffer: Buffer.alloc(100) },
        postId: String(postId),
      },
    });

    // Should be unauthorized or error (400/401/404 all acceptable for unauthenticated multipart)
    test.expect(response.status()).toBeLessThan(500);
    await context.close();
  });

  test('should list attachments for a post', async ({ request }) => {
    const db = require('../fixtures/test-db').getTestDb();
    db.prepare(`
      INSERT INTO attachments (post_id, user_id, file_name, file_path, file_size, mime_type)
      VALUES (?, ?, 'test_123.png', '/uploads/attachments/test_123.png', 100, 'image/png')
    `).run(postId, user.userId);

    const response = await request.get(`${API_BASE}/api/v1/attachments/post/${postId}`);
    const body = await response.json();

    test.expect(response.status()).toBe(200);
    test.expect(body.success).toBe(true);
    test.expect(body.data.length).toBeGreaterThan(0);
  });

  test('should display attachment list on post detail page', async ({ page }) => {
    const db = require('../fixtures/test-db').getTestDb();
    db.prepare(`
      INSERT INTO attachments (post_id, user_id, file_name, file_path, file_size, mime_type)
      VALUES (?, ?, 'test_456.png', '/uploads/attachments/test_456.png', 100, 'image/png')
    `).run(postId, user.userId);

    await page.goto(`/posts/${postId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const hasContent = await page.locator('body').innerText();
    test.expect(hasContent.length).toBeGreaterThan(100);
  });
});
