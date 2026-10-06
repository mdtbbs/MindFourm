import { test as authTest, expect } from '../fixtures/auth.fixture';

authTest.describe('Mobile friends and multiplayer actions', () => {
  authTest('shows profile avatars, pending counts and touch-sized invite actions', async ({ authenticatedPage }) => {
    await authenticatedPage.setViewportSize({ width: 390, height: 844 });
    await authenticatedPage.route('**/api/v1/social/friends/presence?**', (route) => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: { data: [{
        user: { id: 42, username: 'friend', avatar_url: 'https://assets.example.test/friend.png', friendship_since: '2026-01-01' },
        presence: { status: 'online' }, activity: null,
        actions: { can_join: false, can_request_join: false, can_invite: false, session_visible: false },
      }], pagination: { page: 1, limit: 50, total: 1, totalPages: 1 } }, meta: {
        request_id: 'mobile-friends', pagination: { page: 1, limit: 50, total: 1, total_pages: 1, has_more: false },
      } }),
    }));
    await authenticatedPage.route('**/api/v1/blocks?**', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 }, meta: { request_id: 'mobile-blocks' } }),
    }));
    await authenticatedPage.route('**/api/v1/multiplayer/preferences', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ data: { default_client_id: null, clients: [] }, meta: { request_id: 'mobile-preferences' } }),
    }));
    await authenticatedPage.route('**/api/v1/multiplayer/invites', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{
        invite_id: 'inv_mobile', session_id: 'ses_mobile', sender_user_id: 8,
        expires_at: '2026-12-31T00:00:00.000Z', session: { game_id: 'mindustry', activity_name: 'Survival' },
      }], meta: { request_id: 'mobile-invites' } }),
    }));
    await authenticatedPage.route('**/api/v1/multiplayer/join-requests', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ data: { data: [{
        id: 'jrq_mobile', session_id: 'ses_mobile', expires_at: '2026-12-31T00:00:00.000Z',
        requester: { id: 43, username: 'requester', avatar_url: null },
        session: { id: 'ses_mobile', game_id: 'mindustry', game_version: null, activity_name: 'Survival', status: 'active', expires_at: '2026-12-31T00:00:00.000Z' },
      }], total: 1 }, meta: { request_id: 'mobile-join-requests' } }),
    }));
    await authenticatedPage.route('**/api/friends/requests?**', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ requests: [], total: 1, page: 1, limit: 50, totalPages: 1 }),
    }));
    await authenticatedPage.route('**/api/messages/unread-count', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ count: 0 }),
    }));

    await authenticatedPage.goto('/friends', { waitUntil: 'domcontentloaded' });
    await expect(authenticatedPage.getByRole('heading', { name: '好友' }).first()).toBeVisible();
    await expect(authenticatedPage.locator('img[src="https://assets.example.test/friend.png"]')).toBeVisible();
    const pendingTab = authenticatedPage.getByRole('button', { name: /待处理/ });
    await expect(pendingTab).toContainText('3');
    await pendingTab.click();
    await expect(authenticatedPage.getByRole('heading', { name: /联机邀请/ })).toBeVisible();
    await expect(authenticatedPage.getByRole('heading', { name: /加入请求/ })).toBeVisible();
    for (const label of ['接受并加入', '拒绝', '批准']) {
      const control = authenticatedPage.getByRole('button', { name: label });
      const box = await control.boundingBox();
      expect(box?.height || 0, `${label} should be easy to tap on mobile`).toBeGreaterThanOrEqual(44);
    }
  });
});
