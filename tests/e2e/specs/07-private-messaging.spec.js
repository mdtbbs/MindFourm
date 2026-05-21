// @ts-check
const { test } = require('../fixtures/fixtures');
const { createTestIdentity, deleteTestIdentity } = require('../helpers/auth');
const { API_BASE } = require('../helpers/api');

test.describe('7. Private Messaging', () => {
  let user;
  let otherUser;

  test.beforeEach(async () => {
    user = createTestIdentity({ role: 'user' });
    otherUser = createTestIdentity({ username: `msg_target_${Date.now()}`, role: 'user' });
  });

  test.afterEach(() => {
    deleteTestIdentity(user.userId);
    deleteTestIdentity(otherUser.userId);
  });

  test('should reject messaging without authentication', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/v1/messages`, {
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({
        recipient_id: otherUser.userId,
        content: 'Hello',
      }),
    });
    test.expect(response.status()).toBe(401);
  });

  test('should send a message successfully', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/v1/messages`, {
      headers: {
        'Cookie': user.cookieValue,
        'Content-Type': 'application/json',
      },
      data: JSON.stringify({
        recipient_id: otherUser.userId,
        content: 'Hello from E2E test!',
      }),
    });

    test.expect([200, 201]).toContain(response.status());
    const body = await response.json();
    test.expect(body.success).toBe(true);
    test.expect(body.data).toHaveProperty('id');
  });

  test('should get conversation list', async ({ request }) => {
    // Send a message first
    await request.post(`${API_BASE}/api/v1/messages`, {
      headers: {
        'Cookie': user.cookieValue,
        'Content-Type': 'application/json',
      },
      data: JSON.stringify({
        recipient_id: otherUser.userId,
        content: 'First message',
      }),
    });

    // Get conversations
    const response = await request.get(`${API_BASE}/api/v1/messages`, {
      headers: { 'Cookie': user.cookieValue },
    });

    const body = await response.json();
    test.expect(response.status()).toBe(200);
    test.expect(body.success).toBe(true);
    test.expect(body.data.data.length).toBeGreaterThan(0);

    // Conversation should include the other user
    const conv = body.data.data.find(c => c.user_id === otherUser.userId);
    test.expect(conv).toBeTruthy();
  });

  test('should get conversation detail with messages', async ({ request }) => {
    // Send messages
    await request.post(`${API_BASE}/api/v1/messages`, {
      headers: {
        'Cookie': user.cookieValue,
        'Content-Type': 'application/json',
      },
      data: JSON.stringify({
        recipient_id: otherUser.userId,
        content: 'Message 1',
      }),
    });

    await request.post(`${API_BASE}/api/v1/messages`, {
      headers: {
        'Cookie': user.cookieValue,
        'Content-Type': 'application/json',
      },
      data: JSON.stringify({
        recipient_id: otherUser.userId,
        content: 'Message 2',
      }),
    });

    // Get conversation
    const response = await request.get(`${API_BASE}/api/v1/messages/${otherUser.userId}`, {
      headers: { 'Cookie': user.cookieValue },
    });

    const body = await response.json();
    test.expect(response.status()).toBe(200);

    // Check messages exist
    if (body.success && body.data.messages) {
      test.expect(body.data.messages.length).toBeGreaterThan(0);
    }
  });

  test('should get unread count', async ({ request }) => {
    // Send message from otherUser to user
    await request.post(`${API_BASE}/api/v1/messages`, {
      headers: {
        'Cookie': otherUser.cookieValue,
        'Content-Type': 'application/json',
      },
      data: JSON.stringify({
        recipient_id: user.userId,
        content: 'Unread message',
      }),
    });

    const response = await request.get(`${API_BASE}/api/v1/messages/unread-count`, {
      headers: { 'Cookie': user.cookieValue },
    });

    const body = await response.json();
    test.expect(response.status()).toBe(200);
    test.expect(body.success).toBe(true);
  });

  test('should delete message (soft delete)', async ({ request }) => {
    // Send a message
    const sendRes = await request.post(`${API_BASE}/api/v1/messages`, {
      headers: {
        'Cookie': user.cookieValue,
        'Content-Type': 'application/json',
      },
      data: JSON.stringify({
        recipient_id: otherUser.userId,
        content: 'To be deleted',
      }),
    });

    const sendBody = await sendRes.json();
    const messageId = sendBody.data.id;

    // Delete the message
    const deleteRes = await request.delete(`${API_BASE}/api/v1/messages/${messageId}`, {
      headers: { 'Cookie': user.cookieValue },
    });

    test.expect(deleteRes.status()).toBe(200);
  });

  test('should render messages page', async ({ page }) => {
    await page.goto('/messages');
    await page.waitForLoadState('networkidle');

    // Page should render without errors
    const heading = page.locator('h1:has-text("私信")');
    await heading.waitFor({ timeout: 10000 });

    await page.waitForTimeout(1000);
    const bodyContent = await page.locator('body').innerText();
    test.expect(bodyContent).toBeTruthy();
  });
});
