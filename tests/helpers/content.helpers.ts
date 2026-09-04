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

/**
 * One session per user type, reused for the rest of the run.
 *
 * Logging in on every call ran the suite straight into the global write rate limit —
 * seeding a single post takes two logins, and `test-login` started answering 429 partway
 * through, failing tests for a reason that had nothing to do with what they assert.
 * Caching is safe because every request below sends its `Cookie` header explicitly, so
 * whichever session the shared cookie jar happens to hold is irrelevant.
 */
const sessionCache = new Map<TestUserType, SessionCookies>();

/** Sign in as one of the seeded test users and return headers for writes. */
export async function testLogin(
  request: APIRequestContext,
  userType: TestUserType,
): Promise<SessionCookies> {
  const cached = sessionCache.get(userType);
  if (cached) return cached;

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

  const session: SessionCookies = {
    cookieHeader: `csrf_token=${csrfToken}; forum_session=${sessionToken}`,
    csrfToken,
  };
  sessionCache.set(userType, session);
  return session;
}

function writeHeaders({ cookieHeader, csrfToken }: SessionCookies): Record<string, string> {
  return { Cookie: cookieHeader, 'X-CSRF-Token': csrfToken };
}

/**
 * Retry a seeding write through the endpoint's rate limit.
 *
 * `POST /api/posts` allows 10 per minute, which is a sensible product limit and a real
 * obstacle for a suite that seeds a post per test: whichever specs ran last failed with
 * 429 for reasons unrelated to what they assert. Backing off keeps the limit intact —
 * relaxing it for tests would stop exercising it — at the cost of some wall clock.
 */
async function postWithBackoff(
  send: () => Promise<{ ok: () => boolean; status: () => number; json: () => Promise<unknown> }>,
  describe: string,
) {
  // The limiter is a fixed 60-second window, so the last wait has to be long enough to
  // outlast a full window — backing off 7+15+30s totalled 52s and still hit 429.
  const waitsMs = [7000, 20000, 65000];

  for (let attempt = 0; ; attempt += 1) {
    const response = await send();
    if (response.ok()) return response;

    if (response.status() !== 429 || attempt >= waitsMs.length) {
      throw new Error(`${describe}: ${response.status()}`);
    }

    await new Promise((resolve) => setTimeout(resolve, waitsMs[attempt]));
  }
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
  const response = await postWithBackoff(
    () =>
      request.post(`${API_URL}/api/posts`, {
        data: { title: options.title, content: options.content },
        headers: writeHeaders(session),
      }),
    'Failed to create post',
  );

  const body = (await response.json()) as { data?: { id?: number }; id?: number };
  const id = body.data?.id ?? body.id;
  if (!id) throw new Error('Post creation response carried no id');

  await approveAsAdmin(request, 'post', id);
  return { id, title: options.title };
}

/**
 * Create a post and leave it in the moderation queue.
 *
 * For the specs that assert on unpublished content — that an author cannot report their
 * own submission, or self-publish it by editing. Shares the backoff, which a hand-rolled
 * `request.post` in a spec would not.
 */
export async function createPendingPost(
  request: APIRequestContext,
  options: { author: TestUserType; title: string; content: string },
): Promise<SeededPost & { status: string }> {
  const session = await testLogin(request, options.author);
  const response = await postWithBackoff(
    () =>
      request.post(`${API_URL}/api/posts`, {
        data: { title: options.title, content: options.content },
        headers: writeHeaders(session),
      }),
    'Failed to create pending post',
  );

  const body = (await response.json()) as { data?: { id?: number; status?: string } };
  const id = body.data?.id;
  if (!id) throw new Error('Pending post creation response carried no id');

  return { id, title: options.title, status: body.data?.status ?? 'unknown' };
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
  const response = await postWithBackoff(
    () =>
      request.post(`${API_URL}/api/posts/${options.postId}/replies`, {
        data: {
          content: options.content,
          ...(options.parentReplyId ? { parent_reply_id: options.parentReplyId } : {}),
        },
        headers: writeHeaders(session),
      }),
    'Failed to create reply',
  );

  const body = (await response.json()) as { data?: { id?: number }; id?: number };
  const id = body.data?.id ?? body.id;
  if (!id) throw new Error('Reply creation response carried no id');

  await approveAsAdmin(request, 'reply', id);
  return id;
}

export { API_URL };
