/**
 * Helpers for seeding forum content through the API.
 *
 * Two things here are load-bearing and easy to get wrong by hand:
 *
 * 1. Posting with `status: 'published'` does not publish. The API forces everything
 *    except drafts into `pending` so an author cannot bypass review, so a fixture that
 *    wants public content has to clear moderation as an admin afterwards.
 * 2. Playwright's `APIRequestContext` keeps its own cookie jar, and the CSRF middleware
 *    only issues `csrf_token` when the cookie is absent. A second `test-login` on the
 *    same context therefore returns no CSRF cookie at all — read the jar, not the
 *    response headers.
 */

import type { APIRequestContext } from '@playwright/test';

const API_URL = process.env.PLAYWRIGHT_API_URL || 'http://127.0.0.1:4000';

export type TestUserType = 'admin' | 'moderator' | 'user';

export interface SessionCookies {
  cookieHeader: string;
  csrfToken: string;
}

/** Sign in as one of the seeded test users and return headers for writes. */
export async function testLogin(
  request: APIRequestContext,
  userType: TestUserType,
): Promise<SessionCookies> {
  const response = await request.post(`${API_URL}/api/auth/test-login`, {
    data: { userType },
  });

  if (!response.ok()) {
    if (response.status() === 404) {
      throw new Error(
        'test-login is not registered. Start the API with ENABLE_TEST_AUTH=true.',
      );
    }
    throw new Error(`test-login failed for ${userType}: ${response.status()}`);
  }

  const jar = await request.storageState();
  const cookies = new Map(jar.cookies.map((cookie) => [cookie.name, cookie.value]));
  const csrfToken = cookies.get('csrf_token');
  const sessionToken = cookies.get('forum_session');

  if (!csrfToken || !sessionToken) {
    throw new Error(`Missing CSRF or session cookie after ${userType} test-login`);
  }

  return {
    cookieHeader: `csrf_token=${csrfToken}; forum_session=${sessionToken}`,
    csrfToken,
  };
}

function writeHeaders({ cookieHeader, csrfToken }: SessionCookies): Record<string, string> {
  return { Cookie: cookieHeader, 'X-CSRF-Token': csrfToken };
}

/** Approve a queued post or reply as an admin. */
export async function approveAsAdmin(
  request: APIRequestContext,
  type: 'post' | 'reply',
  id: number,
): Promise<void> {
  const session = await testLogin(request, 'admin');
  const response = await request.put(`${API_URL}/api/admin/moderation/${id}/approve`, {
    data: { type },
    headers: writeHeaders(session),
  });

  if (!response.ok()) {
    throw new Error(`Failed to approve ${type} ${id}: ${response.status()}`);
  }
}

export interface SeededPost {
  id: number;
  title: string;
}

/** Create a post as `author` and clear moderation so it is publicly visible. */
export async function createPublishedPost(
  request: APIRequestContext,
  options: { author: TestUserType; title: string; content: string },
): Promise<SeededPost> {
  const session = await testLogin(request, options.author);
  const response = await request.post(`${API_URL}/api/posts`, {
    data: { title: options.title, content: options.content },
    headers: writeHeaders(session),
  });

  if (!response.ok()) {
    throw new Error(`Failed to create post: ${response.status()}`);
  }

  const body = (await response.json()) as { data?: { id?: number }; id?: number };
  const id = body.data?.id ?? body.id;
  if (!id) throw new Error('Post creation response carried no id');

  await approveAsAdmin(request, 'post', id);
  return { id, title: options.title };
}

/** Create a reply — optionally nested under `parentReplyId` — and publish it. */
export async function createPublishedReply(
  request: APIRequestContext,
  options: {
    author: TestUserType;
    postId: number;
    content: string;
    parentReplyId?: number;
  },
): Promise<number> {
  const session = await testLogin(request, options.author);
  const response = await request.post(`${API_URL}/api/posts/${options.postId}/replies`, {
    data: {
      content: options.content,
      ...(options.parentReplyId ? { parent_reply_id: options.parentReplyId } : {}),
    },
    headers: writeHeaders(session),
  });

  if (!response.ok()) {
    throw new Error(`Failed to create reply: ${response.status()}`);
  }

  const body = (await response.json()) as { data?: { id?: number }; id?: number };
  const id = body.data?.id ?? body.id;
  if (!id) throw new Error('Reply creation response carried no id');

  await approveAsAdmin(request, 'reply', id);
  return id;
}

export { API_URL };
