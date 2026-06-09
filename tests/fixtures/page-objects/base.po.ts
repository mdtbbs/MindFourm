import { test as base, Page } from '@playwright/test';

/**
 * Page Object for Login page
 */
export class LoginPage {
  constructor(private page: Page) {}

  async navigate() {
    await this.page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  }

  async clickLoginButton() {
    await this.page.click('[data-testid="login-button"]');
  }

  async waitForMindAuthRedirect() {
    // Wait for redirect to MindAuth (port 4001)
    await this.page.waitForURL(/localhost:4001|mindauth/, { timeout: 10000 });
  }

  async expectRedirectedToMindAuth() {
    const url = this.page.url();
    return url.includes('4001') || url.includes('mindauth');
  }
}

/**
 * Page Object for Home page
 */
export class HomePage {
  constructor(private page: Page) {}

  async navigate() {
    await this.page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  }

  async getPostCards() {
    return this.page.locator('[data-testid="post-card"]');
  }

  async getPostCardCount() {
    return this.page.locator('[data-testid="post-card"]').count();
  }

  async clickNewPost() {
    await this.page.click('[data-testid="new-post-button"]');
  }

  async getCategories() {
    return this.page.locator('[data-testid="category-item"]');
  }

  async search(query: string) {
    await this.page.fill('[data-testid="search-input"]', query);
    await this.page.press('[data-testid="search-input"]', 'Enter');
  }

  async getNotificationBadge() {
    return this.page.locator('[data-testid="notification-badge"]');
  }

  async clickNotificationButton() {
    await this.page.click('[data-testid="notification-button"]');
  }
}

/**
 * Page Object for Post creation/detail
 */
export class PostPage {
  constructor(private page: Page) {}

  async navigateToCreate() {
    await this.page.goto('/posts/new', { waitUntil: 'domcontentloaded', timeout: 60000 });
  }

  async navigateToPost(postId: number) {
    await this.page.goto(`/posts/${postId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  }

  async fillTitle(title: string) {
    await this.page.fill('[name="title"]', title);
  }

  async fillContent(content: string) {
    await this.page.fill('[name="content"]', content);
  }

  async selectCategory(categoryId: number) {
    await this.page.click('[data-testid="category-select"]');
    await this.page.click(`[data-testid="category-option-${categoryId}"]`);
  }

  async addTag(tag: string) {
    await this.page.fill('[data-testid="tag-input"]', tag);
    await this.page.press('[data-testid="tag-input"]', 'Enter');
  }

  async publish() {
    await this.page.click('[data-testid="publish-button"]');
    await this.page.waitForURL(/posts\/\d+/);
  }

  async getTitle() {
    return this.page.locator('h1').textContent();
  }

  async getContent() {
    return this.page.locator('[data-testid="post-content"]').textContent();
  }

  async createReply(content: string) {
    await this.page.fill('[data-testid="reply-input"]', content);
    await this.page.click('[data-testid="submit-reply"]');
  }

  async getReplies() {
    return this.page.locator('[data-testid="reply-item"]');
  }
}

/**
 * Page Object for Admin panel
 */
export class AdminPage {
  constructor(private page: Page) {}

  async navigate() {
    await this.page.goto('/admin', { waitUntil: 'domcontentloaded', timeout: 60000 });
  }

  async navigateToUsers() {
    await this.page.goto('/admin/users', { waitUntil: 'domcontentloaded', timeout: 60000 });
  }

  async navigateToPosts() {
    await this.page.goto('/admin/posts', { waitUntil: 'domcontentloaded', timeout: 60000 });
  }

  async navigateToCategories() {
    await this.page.goto('/admin/categories', { waitUntil: 'domcontentloaded', timeout: 60000 });
  }

  async getStatsCards() {
    return this.page.locator('[data-testid="stat-card"]');
  }

  async getSidebar() {
    return this.page.locator('[data-testid="admin-sidebar"]');
  }
}

// Export extended test with page objects
export const test = base.extend<{
  loginPage: LoginPage;
  homePage: HomePage;
  postPage: PostPage;
  adminPage: AdminPage;
}>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  homePage: async ({ page }, use) => {
    await use(new HomePage(page));
  },
  postPage: async ({ page }, use) => {
    await use(new PostPage(page));
  },
  adminPage: async ({ page }, use) => {
    await use(new AdminPage(page));
  },
});

export { expect } from '@playwright/test';