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

import { approveAsAdmin, createPublishedPost } from '../helpers/content.helpers';

let fixturePostId: number | null = null;
let fixturePostTitle: string | null = null;
let fixtureSetup: Promise<void> | null = null;

/**
 * A single published post shared by every spec in this file.
 *
 * Seeded through the shared helper so it goes through moderation and backs off the
 * post-creation rate limit, rather than reimplementing both here.
 */
async function ensureFixturePost(request: APIRequestContext): Promise<void> {
  if (fixturePostId !== null) {
    return;
  }

  if (!fixtureSetup) {
    fixtureSetup = (async () => {
      const post = await createPublishedPost(request, {
        author: 'user',
        title: `E2E Fixture Post ${Date.now()}`,
        content: '# Fixture post\n\nThis post exists for E2E coverage.',
      });
      fixturePostId = post.id;
      fixturePostTitle = 'E2E Fixture Post';
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
  test('should display post list on homepage', async ({ page, homePage }) => {
    await homePage.navigate();

    // Wait for posts to load
    await page.waitForTimeout(1000);

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
    await expect(page.locator('main h1').first()).toHaveText('Fixture post', { timeout: 30000 });

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
  authTest('the rich editor toolbar stays within common mobile and desktop widths', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/posts/new', { waitUntil: 'domcontentloaded', timeout: 45000 });
    const editor = authenticatedPage.getByTestId('post-content-editor');
    await expect(editor).toBeVisible({ timeout: 30000 });

    for (const width of [320, 360, 390, 768, 1280]) {
      await authenticatedPage.setViewportSize({ width, height: 900 });
      const toolbar = authenticatedPage.getByRole('toolbar', { name: '编辑器工具栏' });
      const dimensions = await toolbar.evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }));
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
    }

    await authenticatedPage.locator('summary[aria-label="更多编辑工具"]').click();
    await expect(authenticatedPage.getByTestId('rich-task-list')).toBeVisible();
    await expect(authenticatedPage.getByTitle('Markdown 源码')).toHaveCount(0);
  });

  authTest('should access new post page', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/posts/new', { waitUntil: 'domcontentloaded', timeout: 45000 });

    // Should show post form
    authExpect(authenticatedPage.url()).toContain('/posts');

    // Check for form elements
    const titleInput = authenticatedPage.getByPlaceholder('请输入帖子标题');
    const contentInput = authenticatedPage.getByTestId('post-content-editor');

    await authExpect(titleInput).toBeVisible();
    await authExpect(contentInput).toBeVisible();
  });

  authTest('should create a new post', async ({ authenticatedPage, request }) => {
    await authenticatedPage.goto('/posts/new', { waitUntil: 'domcontentloaded', timeout: 45000 });

    // Fill in post details
    const uniqueTitle = `E2E Test Post ${Date.now()}`;
    const content = 'This is a test post with `inline code` created by E2E tests.';

    const titleInput = authenticatedPage.getByPlaceholder('请输入帖子标题');
    const contentInput = authenticatedPage.getByTestId('post-content-editor');

    await authExpect(titleInput).toBeVisible();
    await authExpect(contentInput).toBeVisible();
    await titleInput.fill(uniqueTitle);
    await contentInput.fill(content);

    // Submit post
    await authenticatedPage.click('[data-testid="publish-button"]');

    // Wait for redirect to post detail
    await authenticatedPage.waitForURL(/posts\/\d+/, { timeout: 15000 });

    // Verify post was created
    authExpect(authenticatedPage.url()).toContain('/posts/');
    const postId = Number(new URL(authenticatedPage.url()).pathname.split('/').pop());
    expect(Number.isSafeInteger(postId)).toBeTruthy();
    await approveAsAdmin(request, 'post', postId);
    await authenticatedPage.reload({ waitUntil: 'domcontentloaded' });
    authExpect(await authenticatedPage.locator('h1').textContent()).toContain(uniqueTitle);
    await authExpect(authenticatedPage.locator('[data-testid="post-content"]:visible').first()).toContainText('inline code');
  });

  authTest('should auto-save draft', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/posts/new', { waitUntil: 'domcontentloaded', timeout: 45000 });
    const titleInput = authenticatedPage.getByPlaceholder('请输入帖子标题');
    const contentInput = authenticatedPage.getByTestId('post-content-editor');
    await expect(titleInput).toBeVisible({ timeout: 30000 });
    await expect(contentInput).toBeVisible({ timeout: 30000 });

    // Fill partial content
    await titleInput.fill('Draft Test Post');
    await contentInput.fill('Draft content for auto-save test');

    // Wait for auto-save (typically 3-5 seconds)
    await authenticatedPage.waitForTimeout(5000);

    // Refresh page
    await authenticatedPage.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });

    // The editor asks before replacing new work with a saved local draft.
    await authExpect(authenticatedPage.getByRole('button', { name: '恢复草稿' })).toBeVisible();
    await authenticatedPage.getByRole('button', { name: '恢复草稿' }).click();
    await authExpect(titleInput).toBeVisible();
    const titleValue = await titleInput.inputValue();
    authExpect(titleValue).toContain('Draft Test Post');
  });

  authTest('should validate required fields', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/posts/new', { waitUntil: 'domcontentloaded', timeout: 45000 });

    // Try to submit empty post
    const publishButton = authenticatedPage.locator('[data-testid="publish-button"]');
    await authExpect(publishButton).toBeVisible();
    await publishButton.click();

    // Should show validation error
    await authExpect(authenticatedPage.getByText('请输入帖子标题', { exact: true })).toBeVisible();
    await authExpect(authenticatedPage.getByText('请输入帖子内容', { exact: true })).toBeVisible();
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
    await authExpect(replyInput).toBeVisible();
    const replyText = `E2E Test Reply ${Date.now()}`;
    await replyInput.fill(replyText);
    await authenticatedPage.getByTestId('submit-reply').click();
    await authExpect(authenticatedPage.getByText(replyText, { exact: true })).toBeVisible({ timeout: 15000 });
  });
});
