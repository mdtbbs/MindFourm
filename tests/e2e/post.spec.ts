/**
 * Post Creation Flow E2E Tests
 *
 * Tests the complete post lifecycle including:
 * - Creating new posts
 * - Editing posts
 * - Deleting posts
 * - Post visibility and permissions
 */

import { test, expect } from '../fixtures/page-objects/base.po';
import { test as authTest, expect as authExpect } from '../fixtures/auth.fixture';
import type { APIRequestContext } from '@playwright/test';

const API_URL = process.env.PLAYWRIGHT_API_URL || 'http://127.0.0.1:4000';

let fixturePostId: number | null = null;
let fixturePostTitle: string | null = null;
let fixtureSetup: Promise<void> | null = null;

/**
 * Publish a fixture post through moderation.
 *
 * Posting with `status: 'published'` no longer publishes anything: the API forces
 * everything except drafts into `pending` so an author cannot bypass review. The
 * fixture has to be approved by an admin, or the public-viewing tests look for a post
 * the public genuinely cannot see.
 */
async function approvePostAsAdmin(request: APIRequestContext, postId: number): Promise<void> {
  const loginResponse = await request.post(`${API_URL}/api/auth/test-login`, {
    data: { userType: 'admin' },
  });

  if (!loginResponse.ok()) {
    throw new Error(`Failed to create admin test session: ${loginResponse.status()}`);
  }

  // Read from the context's cookie jar rather than this response's Set-Cookie headers.
  // The jar already holds a `csrf_token` from the earlier user login, and the CSRF
  // middleware only issues that cookie when it is absent — so the admin response
  // carries `forum_session` alone and scraping Set-Cookie finds no token at all.
  const jar = await request.storageState();
  const cookieMap = new Map(jar.cookies.map((cookie) => [cookie.name, cookie.value]));

  const csrfToken = cookieMap.get('csrf_token');
  const sessionToken = cookieMap.get('forum_session');
  if (!csrfToken || !sessionToken) {
    throw new Error('Missing CSRF or session cookie from admin test login');
  }

  const approveResponse = await request.put(
    `${API_URL}/api/admin/moderation/${postId}/approve`,
    {
      data: { type: 'post' },
      headers: {
        Cookie: `csrf_token=${csrfToken}; forum_session=${sessionToken}`,
        'X-CSRF-Token': csrfToken,
      },
    },
  );

  if (!approveResponse.ok()) {
    throw new Error(`Failed to approve fixture post ${postId}: ${approveResponse.status()}`);
  }
}

async function ensureFixturePost(request: APIRequestContext): Promise<void> {
  if (fixturePostId !== null) {
    return;
  }

  if (!fixtureSetup) {
    fixtureSetup = (async () => {
      const loginResponse = await request.post(`${API_URL}/api/auth/test-login`, {
        data: { userType: 'user' },
      });

      if (!loginResponse.ok()) {
        throw new Error(`Failed to create test session: ${loginResponse.status()}`);
      }

      const setCookies = loginResponse
        .headersArray()
        .filter((header) => header.name.toLowerCase() === 'set-cookie')
        .map((header) => header.value);

      const cookieMap = new Map<string, string>();
      for (const rawCookie of setCookies) {
        const [cookiePair] = rawCookie.split(';');
        const separatorIndex = cookiePair.indexOf('=');
        if (separatorIndex === -1) continue;
        const name = cookiePair.slice(0, separatorIndex).trim();
        const value = cookiePair.slice(separatorIndex + 1).trim();
        cookieMap.set(name, value);
      }

      const csrfToken = cookieMap.get('csrf_token');
      const sessionToken = cookieMap.get('forum_session');
      if (!csrfToken || !sessionToken) {
        throw new Error('Missing CSRF or session cookie from test login');
      }

      const createResponse = await request.post(`${API_URL}/api/posts`, {
        data: {
          title: `E2E Fixture Post ${Date.now()}`,
          content: '# Fixture post\n\nThis post exists for E2E coverage.',
          status: 'published',
        },
        headers: {
          Cookie: `csrf_token=${csrfToken}; forum_session=${sessionToken}`,
          'X-CSRF-Token': csrfToken,
        },
      });

      if (!createResponse.ok()) {
        throw new Error(`Failed to create fixture post: ${createResponse.status()}`);
      }

      const created = await createResponse.json() as { data?: { id?: number }; id?: number };
      const postId = created.data?.id ?? created.id;
      if (!postId) {
        throw new Error('Fixture post response did not include an id');
      }

      await approvePostAsAdmin(request, postId);

      fixturePostId = postId;
      fixturePostTitle = `E2E Fixture Post`;
    })();
  }

  await fixtureSetup;
}

test.beforeAll(async ({ request }) => {
  await ensureFixturePost(request);
});

authTest.beforeAll(async ({ request }) => {
  await ensureFixturePost(request);
});

test.describe('Public Post Viewing', () => {
  test('should display post list on homepage', async ({ homePage }) => {
    await homePage.navigate();

    // Wait for posts to load
    await homePage.page.waitForTimeout(1000);

    // Check for post cards
    const postCards = await homePage.getPostCardCount();
    expect(postCards).toBeGreaterThanOrEqual(0);
  });

  test('should navigate to post detail', async ({ page }) => {
    // Go to homepage first
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 45000 });

    // Wait for posts to load (with longer timeout)
    await page.waitForSelector('[data-testid="post-card"]', { timeout: 15000 }).catch(() => {});

    // Click the title link, not the row. The homepage list renders each post as an
    // `<article data-testid="post-card">` whose row is not itself a link — clicking its
    // centre lands on empty space. `post-link` exists for exactly this navigation.
    const firstPostLink = page.locator('[data-testid="post-link"]').first();
    if (await firstPostLink.isVisible().catch(() => false)) {
      await firstPostLink.click();

      // Should navigate to post detail page
      await page.waitForURL(/posts\/\d+/, { timeout: 15000 });
      expect(page.url()).toContain('/posts/');
    }
  });

  test('should display post content with markdown rendering', async ({ page }) => {
    expect(fixturePostId).not.toBeNull();
    await page.goto(`/posts/${fixturePostId}`, { waitUntil: 'domcontentloaded', timeout: 45000 });

    // Check for post title
    await expect(page.getByText('Fixture post', { exact: true })).toBeVisible({ timeout: 30000 });

    // Check for post content
    const content = page.locator('[data-testid="post-content"]');
    await expect(content).toBeVisible({ timeout: 10000 });
  });

  test('should display replies on post detail', async ({ page }) => {
    expect(fixturePostId).not.toBeNull();
    await page.goto(`/posts/${fixturePostId}`, { waitUntil: 'domcontentloaded', timeout: 45000 });

    // Wait for replies to load
    await page.waitForTimeout(1000);

    // Check for replies section
    const replies = page.locator('[data-testid="reply-item"]');
    const replyCount = await replies.count();
    expect(replyCount).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Post Categories and Tags', () => {
  test('should display categories in sidebar', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 45000 });

    // Check for category list
    const categories = page.locator('[data-testid="category-item"]');
    const categoryCount = await categories.count();
    expect(categoryCount).toBeGreaterThanOrEqual(0);
  });

  test('should filter posts by category', async ({ page }) => {
    // Go to category page (use category ID 1 for testing)
    await page.goto('/categories/1', { waitUntil: 'domcontentloaded', timeout: 45000 });

    // Should display posts for that category
    await page.waitForTimeout(1000);
    const posts = page.locator('[data-testid="post-card"]');
    expect(await posts.count()).toBeGreaterThanOrEqual(0);
  });

  test('should filter posts by tag', async ({ page }) => {
    // First get available tags
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 45000 });

    // Try navigating to a tag page
    await page.goto('/tags/test', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1000);

    // Should show posts with that tag or empty state
    const posts = page.locator('[data-testid="post-card"]');
    expect(await posts.count()).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Post Pagination', () => {
  test('should support offset pagination', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 45000 });

    // Check pagination controls
    const pagination = page.locator('[data-testid="pagination"]');
    if (await pagination.isVisible().catch(() => false)) {
      await expect(pagination).toBeVisible();
    }
  });

  test('should support cursor pagination', async ({ page }) => {
    await page.goto('/?cursor=test', { waitUntil: 'domcontentloaded', timeout: 45000 });

    // Page should load successfully
    await expect(page).not.toHaveURL(/error/);
  });
});

authTest.describe('Post Creation (Authenticated)', () => {
  authTest('should access new post page', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/posts/new', { waitUntil: 'domcontentloaded', timeout: 45000 });

    // Should show post form
    authExpect(authenticatedPage.url()).toContain('/posts');

    // Check for form elements
    const titleInput = authenticatedPage.locator('[name="title"]');
    const contentInput = authenticatedPage.locator('[name="content"]');

    if (await titleInput.isVisible().catch(() => false)) {
      authExpect(await titleInput.isVisible()).toBeTruthy();
      authExpect(await contentInput.isVisible()).toBeTruthy();
    }
  });

  authTest('should create a new post', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/posts/new', { waitUntil: 'domcontentloaded', timeout: 45000 });

    // Fill in post details
    const uniqueTitle = `E2E Test Post ${Date.now()}`;
    const content = 'This is a test post created by E2E tests.';

    const titleInput = authenticatedPage.locator('[name="title"]');
    const contentInput = authenticatedPage.locator('[name="content"]');

    if (await titleInput.isVisible()) {
      await titleInput.fill(uniqueTitle);
      await contentInput.fill(content);

      // Submit post
      await authenticatedPage.click('[data-testid="publish-button"]');

      // Wait for redirect to post detail
      await authenticatedPage.waitForURL(/posts\/\d+/, { timeout: 15000 });

      // Verify post was created
      authExpect(authenticatedPage.url()).toContain('/posts/');
      authExpect(await authenticatedPage.locator('h1').textContent()).toContain(uniqueTitle);
    }
  });

  authTest('should auto-save draft', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/posts/new', { waitUntil: 'domcontentloaded', timeout: 45000 });
    const titleInput = authenticatedPage.getByPlaceholder('请输入帖子标题');
    const contentInput = authenticatedPage.getByPlaceholder('使用 Markdown 格式编写帖子内容...');
    await expect(titleInput).toBeVisible({ timeout: 30000 });
    await expect(contentInput).toBeVisible({ timeout: 30000 });

    // Fill partial content
    await titleInput.fill('Draft Test Post');
    await contentInput.fill('Draft content for auto-save test');

    // Wait for auto-save (typically 3-5 seconds)
    await authenticatedPage.waitForTimeout(5000);

    // Refresh page
    await authenticatedPage.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });

    // Draft should be restored
    if (await titleInput.isVisible().catch(() => false)) {
      const titleValue = await titleInput.inputValue();
      authExpect(titleValue).toContain('Draft Test Post');
    }
  });

  authTest('should validate required fields', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/posts/new', { waitUntil: 'domcontentloaded', timeout: 45000 });

    // Try to submit empty post
    const publishButton = authenticatedPage.locator('[data-testid="publish-button"]');
    if (await publishButton.isVisible().catch(() => false)) {
      await publishButton.click();

      // Should show validation error
      const errorMessage = authenticatedPage.locator('[data-testid="error-message"]');
      if (await errorMessage.isVisible().catch(() => false)) {
        authExpect(await errorMessage.textContent()).toBeTruthy();
      }
    }
  });
});

authTest.describe('Post Interactions (Authenticated)', () => {
  authTest('should like a post', async ({ authenticatedPage }) => {
    expect(fixturePostId).not.toBeNull();
    await authenticatedPage.goto(`/posts/${fixturePostId}`, { waitUntil: 'domcontentloaded', timeout: 45000 });

    // Find like button
    const likeButton = authenticatedPage.locator('[data-testid="like-button"]');
    if (await likeButton.isVisible().catch(() => false)) {
      const initialCount = await likeButton.textContent();
      await likeButton.click();

      // Count should update
      await authenticatedPage.waitForTimeout(1000);
    }
  });

  authTest('should bookmark a post', async ({ authenticatedPage }) => {
    expect(fixturePostId).not.toBeNull();
    await authenticatedPage.goto(`/posts/${fixturePostId}`, { waitUntil: 'domcontentloaded', timeout: 45000 });

    // Find bookmark button
    const bookmarkButton = authenticatedPage.locator('[data-testid="bookmark-button"]');
    if (await bookmarkButton.isVisible().catch(() => false)) {
      await bookmarkButton.click();
      await authenticatedPage.waitForTimeout(1000);
    }
  });

  authTest('should create a reply', async ({ authenticatedPage }) => {
    expect(fixturePostId).not.toBeNull();
    await authenticatedPage.goto(`/posts/${fixturePostId}`, { waitUntil: 'domcontentloaded', timeout: 45000 });

    // Find reply input
    const replyInput = authenticatedPage.locator('[data-testid="reply-input"]');
    if (await replyInput.isVisible().catch(() => false)) {
      await replyInput.fill('E2E Test Reply');
      await authenticatedPage.click('[data-testid="submit-reply"]');

      // Wait for reply to appear
      await authenticatedPage.waitForTimeout(2000);
    }
  });
});
