/**
 * Editing posts and replies.
 *
 * The API has always accepted `PUT /posts/:id` and `PUT`/`DELETE /replies/:id`; nothing
 * in the UI ever called them, so a member could publish and then had no way to fix a
 * typo or withdraw a reply. These specs cover the entry points that were missing, and
 * the ownership rules that decide who sees them.
 */

import { test as authTest, expect as authExpect } from '../fixtures/auth.fixture';
import { expect, test } from '@playwright/test';
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

authTest.describe('Editing a post', () => {
  authTest('the author edits their own post and the change is published', async ({
    authenticatedPage,
    request,
  }) => {
    const post = await createPublishedPost(request, {
      author: 'user',
      title: unique('E2E Editable Post'),
      content: 'Original body text.',
    });

    await authenticatedPage.goto(`/posts/${post.id}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    await authenticatedPage.getByTestId('post-edit-link').click();
    await authenticatedPage.waitForURL(/\/posts\/\d+\/edit$/, { timeout: 30000 });

    const revisedTitle = `${post.title} (edited)`;
    await authenticatedPage.getByTestId('post-edit-title').fill(revisedTitle);
    await authenticatedPage.getByTestId('post-edit-content').fill('Revised body text.');
    await authenticatedPage.getByTestId('post-edit-submit').click();

    await authenticatedPage.waitForURL(/\/posts\/\d+$/, { timeout: 30000 });
    await authExpect(authenticatedPage.locator('h1')).toContainText(revisedTitle);
    await authExpect(authenticatedPage.getByText('Revised body text.')).toBeVisible();
  });

  authTest('the save button stays disabled until something actually changes', async ({
    authenticatedPage,
    request,
  }) => {
    const post = await createPublishedPost(request, {
      author: 'user',
      title: unique('E2E Dirty Guard'),
      content: 'Unchanged body.',
    });

    await authenticatedPage.goto(`/posts/${post.id}/edit`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    await authExpect(authenticatedPage.getByTestId('post-edit-submit')).toBeDisabled();
    await authenticatedPage.getByTestId('post-edit-content').fill('Now it differs.');
    await authExpect(authenticatedPage.getByTestId('post-edit-submit')).toBeEnabled();
  });

  authTest('a member sees no edit link on a post they did not write', async ({
    authenticatedPage,
    request,
  }) => {
    const post = await createPublishedPost(request, {
      author: 'admin',
      title: unique('E2E Foreign Post'),
      content: 'Written by someone else.',
    });

    await authenticatedPage.goto(`/posts/${post.id}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    await authExpect(authenticatedPage.getByTestId('post-edit-link')).toHaveCount(0);
  });

  authTest('the edit route itself is closed to non-authors, not just hidden', async ({
    authenticatedPage,
    request,
  }) => {
    const post = await createPublishedPost(request, {
      author: 'admin',
      title: unique('E2E Guarded Edit Route'),
      content: 'Direct navigation should not reach the form.',
    });

    const response = await authenticatedPage.goto(`/posts/${post.id}/edit`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    expect(response?.status()).toBe(404);
  });
});

authTest.describe('Editing and deleting a reply', () => {
  authTest('the author edits their reply in place', async ({ authenticatedPage, request }) => {
    const post = await createPublishedPost(request, {
      author: 'admin',
      title: unique('E2E Reply Edit Host'),
      content: 'Host post.',
    });
    const replyId = await createPublishedReply(request, {
      author: 'user',
      postId: post.id,
      content: 'Reply as first written',
    });

    await authenticatedPage.goto(`/posts/${post.id}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    await authenticatedPage.getByTestId(`reply-edit-${replyId}`).click();
    await authenticatedPage.getByTestId(`reply-edit-input-${replyId}`).fill('Reply after correction');
    await authenticatedPage.getByTestId(`reply-edit-save-${replyId}`).click();

    await authExpect(authenticatedPage.getByText('Reply after correction')).toBeVisible({
      timeout: 30000,
    });
  });

  authTest('the author deletes their reply and it leaves the thread', async ({
    authenticatedPage,
    request,
  }) => {
    const post = await createPublishedPost(request, {
      author: 'admin',
      title: unique('E2E Reply Delete Host'),
      content: 'Host post.',
    });
    const replyId = await createPublishedReply(request, {
      author: 'user',
      postId: post.id,
      content: 'Reply that will be withdrawn',
    });

    await authenticatedPage.goto(`/posts/${post.id}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    authenticatedPage.once('dialog', (dialog) => dialog.accept());
    await authenticatedPage.getByTestId(`reply-delete-${replyId}`).click();

    await authExpect(authenticatedPage.locator(`#reply-${replyId}`)).toHaveCount(0, {
      timeout: 30000,
    });
  });

  authTest('no edit or delete control appears on another member\'s reply', async ({
    authenticatedPage,
    request,
  }) => {
    const post = await createPublishedPost(request, {
      author: 'admin',
      title: unique('E2E Foreign Reply'),
      content: 'Host post.',
    });
    const replyId = await createPublishedReply(request, {
      author: 'admin',
      postId: post.id,
      content: 'Someone else wrote this',
    });

    await authenticatedPage.goto(`/posts/${post.id}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    await authExpect(authenticatedPage.locator(`#reply-${replyId}`)).toBeVisible();
    await authExpect(authenticatedPage.getByTestId(`reply-edit-${replyId}`)).toHaveCount(0);
    await authExpect(authenticatedPage.getByTestId(`reply-delete-${replyId}`)).toHaveCount(0);
  });
});

test.describe('Edit authorisation at the API', () => {
  test('a member cannot edit a post they did not write', async ({ request }) => {
    const post = await createPublishedPost(request, {
      author: 'admin',
      title: unique('E2E API Guard'),
      content: 'Admin content.',
    });

    const session = await testLogin(request, 'user');
    const response = await request.put(`${API_URL}/api/posts/${post.id}`, {
      data: { title: 'Hijacked title' },
      headers: { Cookie: session.cookieHeader, 'X-CSRF-Token': session.csrfToken },
    });

    expect([403, 404]).toContain(response.status());
  });

  test('an author cannot publish their own pending post by editing it', async ({ request }) => {
    // Self-publishing through the moderation queue is the bypass this guards.
    const session = await testLogin(request, 'user');
    const post = await createPendingPost(request, {
      author: 'user',
      title: unique('E2E Pending Post'),
      content: 'Awaiting review.',
    });
    expect(post.status).toBe('pending');

    const response = await request.put(`${API_URL}/api/posts/${post.id}`, {
      data: { title: 'Still pending', status: 'published' },
      headers: { Cookie: session.cookieHeader, 'X-CSRF-Token': session.csrfToken },
    });
    expect(response.status()).toBe(403);
  });
});
