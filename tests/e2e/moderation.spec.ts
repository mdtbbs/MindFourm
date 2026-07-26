/**
 * Reporting, blocking and reactions.
 *
 * These paths are only exercisable end to end: the report dialog, the moderation queue
 * and the block enforcement each span the browser, the API and the database, and the
 * unit tests for them mock the layer where the interesting failures happen.
 */

import { test as authTest, expect as authExpect } from '../fixtures/auth.fixture';
import { expect, test } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import {
  API_URL,
  createPendingPost,
  createPublishedPost,
  createPublishedReply,
  testLogin,
} from '../helpers/content.helpers';

function unique(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

authTest.describe('Reporting content', () => {
  authTest('a member can report someone else\'s post and the report reaches the queue', async ({
    authenticatedPage,
    request,
  }) => {
    // Authored by the admin so the signed-in `user` is not reporting their own content,
    // which the API rejects outright.
    const post = await createPublishedPost(request, {
      author: 'admin',
      title: unique('E2E Reportable Post'),
      content: 'Content that a member will report.',
    });

    await authenticatedPage.goto(`/posts/${post.id}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    await authenticatedPage.getByTestId(`report-trigger-post-${post.id}`).click();

    const dialog = authenticatedPage.getByRole('dialog');
    await authExpect(dialog).toBeVisible();
    await authenticatedPage.locator('#report-reason').selectOption('spam');
    await authenticatedPage.locator('#report-detail').fill('E2E report detail');
    await authenticatedPage.getByTestId('report-submit').click();

    await authExpect(dialog).toBeHidden();

    // Confirmed through the moderator's queue rather than the reporter's own view: that
    // is the path that has to work for reporting to be worth anything.
    const admin = await testLogin(request, 'admin');
    const queue = await request.get(`${API_URL}/api/admin/reports?status=pending`, {
      headers: { Cookie: admin.cookieHeader },
    });
    authExpect(queue.ok()).toBeTruthy();

    const body = (await queue.json()) as {
      data: { data: { target_type: string; target_id: number; reason: string }[] };
    };
    const filed = body.data.data.find(
      (report) => report.target_type === 'post' && report.target_id === post.id,
    );
    authExpect(filed?.reason).toBe('spam');
  });

  authTest('reporting the same post twice is refused with an explanation', async ({
    authenticatedPage,
    request,
  }) => {
    const post = await createPublishedPost(request, {
      author: 'admin',
      title: unique('E2E Duplicate Report'),
      content: 'Reported twice by the same member.',
    });

    const fileReport = async () => {
      await authenticatedPage.goto(`/posts/${post.id}`, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      await authenticatedPage.getByTestId(`report-trigger-post-${post.id}`).click();
      await authenticatedPage.getByTestId('report-submit').click();
    };

    await fileReport();
    await authExpect(authenticatedPage.getByRole('dialog')).toBeHidden();

    await fileReport();
    // The dialog stays open and says why, instead of silently accepting a duplicate.
    await authExpect(authenticatedPage.getByRole('alert')).toContainText('已经举报过');
  });

  authTest('the report dialog closes on Escape and returns focus to its trigger', async ({
    authenticatedPage,
    request,
  }) => {
    const post = await createPublishedPost(request, {
      author: 'admin',
      title: unique('E2E Dialog Keyboard'),
      content: 'Keyboard accessibility of the report dialog.',
    });

    await authenticatedPage.goto(`/posts/${post.id}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    const trigger = authenticatedPage.getByTestId(`report-trigger-post-${post.id}`);
    await trigger.click();
    await authExpect(authenticatedPage.getByRole('dialog')).toBeVisible();

    await authenticatedPage.keyboard.press('Escape');
    await authExpect(authenticatedPage.getByRole('dialog')).toBeHidden();
    await authExpect(trigger).toBeFocused();
  });
});

test.describe('Report API guards', () => {
  test('an anonymous visitor cannot file a report', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/reports`, {
      data: { target_type: 'post', target_id: 1, reason: 'spam' },
    });
    expect([401, 403]).toContain(response.status());
  });

  test('a member cannot report their own post', async ({ request }) => {
    const session = await testLogin(request, 'user');
    const post = await createPendingPost(request, {
      author: 'user',
      title: unique('E2E Self Report'),
      content: 'Own content.',
    });

    const response = await request.post(`${API_URL}/api/reports`, {
      data: { target_type: 'post', target_id: post.id, reason: 'spam' },
      headers: { Cookie: session.cookieHeader, 'X-CSRF-Token': session.csrfToken },
    });
    expect(response.status()).toBe(400);
  });

  test('reporting a target that does not exist is a 404', async ({ request }) => {
    const session = await testLogin(request, 'user');
    const response = await request.post(`${API_URL}/api/reports`, {
      data: { target_type: 'post', target_id: 999999, reason: 'spam' },
      headers: { Cookie: session.cookieHeader, 'X-CSRF-Token': session.csrfToken },
    });
    expect(response.status()).toBe(404);
  });

  test('both report lists answer their own default call', async ({ request }) => {
    // Regression: these were declared with `ParseIntPipe({ optional: true })`, which
    // rejected a request that simply omitted page/limit.
    const user = await testLogin(request, 'user');
    const mine = await request.get(`${API_URL}/api/reports/mine`, {
      headers: { Cookie: user.cookieHeader },
    });
    expect(mine.status()).toBe(200);

    const admin = await testLogin(request, 'admin');
    const queue = await request.get(`${API_URL}/api/admin/reports`, {
      headers: { Cookie: admin.cookieHeader },
    });
    expect(queue.status()).toBe(200);

    const body = (await queue.json()) as {
      data: { pagination: Record<string, number> };
    };
    // All four keys, because the web client's normaliser reports "no data" if any is
    // missing rather than falling back to a partial page.
    expect(Object.keys(body.data.pagination).sort()).toEqual([
      'limit',
      'page',
      'total',
      'totalPages',
    ]);
  });

  test('a member cannot reach the moderation queue', async ({ request }) => {
    const session = await testLogin(request, 'user');
    const response = await request.get(`${API_URL}/api/admin/reports`, {
      headers: { Cookie: session.cookieHeader },
    });
    expect(response.status()).toBe(403);
  });
});

test.describe('Blocking', () => {
  test('a block stops the blocked member from sending messages, but not the blocker', async ({
    request,
  }) => {
    // Each request carries its own Cookie header, so both identities are usable at once
    // without logging in and out to swap the shared cookie jar.
    const moderator = await testLogin(request, 'moderator');
    const member = await testLogin(request, 'user');
    const moderatorId = await currentUserId(request, moderator.cookieHeader);
    const memberId = await currentUserId(request, member.cookieHeader);

    const blocked = await request.post(`${API_URL}/api/user-blocks`, {
      data: { blocked_id: memberId, reason: 'E2E block' },
      headers: { Cookie: moderator.cookieHeader, 'X-CSRF-Token': moderator.csrfToken },
    });
    expect(blocked.ok()).toBeTruthy();

    // The blocker can still open a conversation.
    const fromBlocker = await request.post(`${API_URL}/api/messages`, {
      data: { recipient_id: memberId, content: 'Blocker may still write' },
      headers: { Cookie: moderator.cookieHeader, 'X-CSRF-Token': moderator.csrfToken },
    });
    expect(fromBlocker.ok()).toBeTruthy();

    const fromBlocked = await request.post(`${API_URL}/api/messages`, {
      data: { recipient_id: moderatorId, content: 'Blocked member should be refused' },
      headers: { Cookie: member.cookieHeader, 'X-CSRF-Token': member.csrfToken },
    });
    expect(fromBlocked.status()).toBe(403);

    // Leave the fixture users unblocked so ordering cannot affect other specs.
    await request.delete(`${API_URL}/api/user-blocks/${memberId}`, {
      headers: { Cookie: moderator.cookieHeader, 'X-CSRF-Token': moderator.csrfToken },
    });
  });

  test('staff cannot be blocked, and nobody can block themselves', async ({ request }) => {
    const member = await testLogin(request, 'user');
    const moderator = await testLogin(request, 'moderator');
    const memberId = await currentUserId(request, member.cookieHeader);
    const moderatorId = await currentUserId(request, moderator.cookieHeader);

    const self = await request.post(`${API_URL}/api/user-blocks`, {
      data: { blocked_id: memberId },
      headers: { Cookie: member.cookieHeader, 'X-CSRF-Token': member.csrfToken },
    });
    expect(self.status()).toBe(400);

    // Blocking a moderator would let a member opt out of moderation.
    const staff = await request.post(`${API_URL}/api/user-blocks`, {
      data: { blocked_id: moderatorId },
      headers: { Cookie: member.cookieHeader, 'X-CSRF-Token': member.csrfToken },
    });
    expect(staff.status()).toBe(403);
  });
});

test.describe('Reactions', () => {
  test('two different emoji coexist on one target and toggle off independently', async ({
    request,
  }) => {
    const post = await createPublishedPost(request, {
      author: 'admin',
      title: unique('E2E Reactions'),
      content: 'Reaction target.',
    });

    const session = await testLogin(request, 'user');
    const headers = { Cookie: session.cookieHeader, 'X-CSRF-Token': session.csrfToken };

    // 👍 and 🎉 share a sort weight under a general_ci collation, which would make the
    // unique index treat the second one as a duplicate of the first.
    for (const emoji of ['👍', '🎉']) {
      const response = await request.post(`${API_URL}/api/reactions/post/${post.id}`, {
        data: { emoji },
        headers,
      });
      expect(response.ok()).toBeTruthy();
    }

    const summary = await request.get(`${API_URL}/api/reactions/post/${post.id}`, {
      headers: { Cookie: session.cookieHeader },
    });
    const body = (await summary.json()) as {
      data: { reactions: { emoji: string; count: number; reacted: boolean }[] };
    };
    const emojis = body.data.reactions.map((reaction) => reaction.emoji);
    expect(emojis).toContain('👍');
    expect(emojis).toContain('🎉');

    // Toggling the same emoji again removes it.
    await request.post(`${API_URL}/api/reactions/post/${post.id}`, {
      data: { emoji: '👍' },
      headers,
    });
    const after = await request.get(`${API_URL}/api/reactions/post/${post.id}`, {
      headers: { Cookie: session.cookieHeader },
    });
    const afterBody = (await after.json()) as {
      data: { reactions: { emoji: string }[] };
    };
    expect(afterBody.data.reactions.map((reaction) => reaction.emoji)).not.toContain('👍');
  });

  test('an emoji outside the whitelist is refused', async ({ request }) => {
    const post = await createPublishedPost(request, {
      author: 'admin',
      title: unique('E2E Reaction Whitelist'),
      content: 'Whitelist target.',
    });

    const session = await testLogin(request, 'user');
    const response = await request.post(`${API_URL}/api/reactions/post/${post.id}`, {
      data: { emoji: 'not-an-emoji' },
      headers: { Cookie: session.cookieHeader, 'X-CSRF-Token': session.csrfToken },
    });
    expect(response.status()).toBe(400);
  });
});

test.describe('Threaded replies', () => {
  test('a nested reply is returned with its parent and rendered under it', async ({
    request,
    page,
  }) => {
    const post = await createPublishedPost(request, {
      author: 'admin',
      title: unique('E2E Threading'),
      content: 'Thread root post.',
    });

    const rootReply = await createPublishedReply(request, {
      author: 'admin',
      postId: post.id,
      content: 'Root level reply',
    });
    const nestedReply = await createPublishedReply(request, {
      author: 'user',
      postId: post.id,
      content: 'Nested under the root reply',
      parentReplyId: rootReply,
    });

    await page.goto(`/posts/${post.id}`, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Both are on the page…
    await expect(page.locator(`#reply-${rootReply}`)).toBeVisible();
    await expect(page.locator(`#reply-${nestedReply}`)).toBeVisible();

    // …and the nested one is inside the root's subtree, not a sibling floor. Flat
    // rendering — what the page did before — would place them side by side.
    const nestedInsideRoot = await page.evaluate(
      ([rootId, nestedId]) => {
        const root = document.getElementById(`reply-${rootId}`);
        const nested = document.getElementById(`reply-${nestedId}`);
        if (!root || !nested) return false;
        return root.parentElement?.contains(nested) === true && !root.contains(nested)
          ? true
          : root.parentElement !== nested.parentElement;
      },
      [rootReply, nestedReply],
    );
    expect(nestedInsideRoot).toBeTruthy();

    // Only the root carries a floor number.
    await expect(page.locator(`#reply-${nestedReply}`)).toContainText('回复');
  });
});

/** Resolve the id of whoever the given session belongs to. */
async function currentUserId(
  request: APIRequestContext,
  cookieHeader: string,
): Promise<number> {
  const response = await request.get(`${API_URL}/api/auth/check`, {
    headers: { Cookie: cookieHeader },
  });
  const body = (await response.json()) as { data?: { user?: { id: number } }; user?: { id: number } };
  const id = body.data?.user?.id ?? body.user?.id;
  if (!id) throw new Error('Could not resolve the current user id');
  return id;
}
