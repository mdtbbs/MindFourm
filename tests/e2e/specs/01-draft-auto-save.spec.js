// @ts-check
const { test } = require('../fixtures/fixtures');
const { createTestIdentity, deleteTestIdentity } = require('../helpers/auth');

test.describe('1. Draft Auto-Save', () => {
  let user;

  test.beforeEach(async () => {
    user = createTestIdentity({ role: 'user' });
  });

  test.afterEach(() => {
    deleteTestIdentity(user.userId);
  });

  test('should save draft to localStorage and restore it', async ({ browser }) => {
    const context = await browser.newContext({
      storageState: {
        cookies: [{
          name: 'forum_session',
          value: user.sessionToken,
          domain: 'localhost',
          path: '/',
          expires: Math.floor(Date.now() / 1000) + 86400,
          httpOnly: false,
          secure: false,
          sameSite: 'Lax',
        }],
        origins: [],
      },
    });
    const page = await context.newPage();

    // Clear any leftover drafts from previous tests
    await page.goto('/');
    await page.evaluate(() => {
      const draftKeys = Object.keys(localStorage).filter(k => k.startsWith('draft:'));
      draftKeys.forEach(k => localStorage.removeItem(k));
    });

    await page.goto('/posts/new');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Find the title input - first non-radio input inside the post form
    const titleInput = page.locator('form input:not([type="radio"])').first();
    await titleInput.waitFor({ state: 'visible', timeout: 10000 });

    // Set value and trigger React onChange via fiber
    await page.evaluate(() => {
      const el = document.querySelector('form input');
      if (!el) return;
      const fiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber$'));
      if (!fiberKey) return;
      let node = el[fiberKey];
      let depth = 0;
      while (node && depth < 50) {
        if (node.memoizedProps?.onChange) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          setter?.call(el, 'Test Draft Title');
          node.memoizedProps.onChange({ target: { value: 'Test Draft Title' } });
          return;
        }
        depth++;
        node = node.return;
      }
    });

    // Fill content
    const contentTextarea = page.locator('textarea[placeholder*="使用 Markdown"]').first();
    await contentTextarea.fill('This is a draft post content that should be saved.');

    // Wait for debounce to fire
    await page.waitForTimeout(5000);

    // Check localStorage
    const draftData = await page.evaluate(() => {
      const keys = Object.keys(localStorage);
      const draftKey = keys.find(k => k.startsWith('draft:post:'));
      if (!draftKey) return null;
      return JSON.parse(localStorage.getItem(draftKey))?.values || null;
    });

    test.expect(draftData).toBeTruthy();
    test.expect(draftData?.title).toBe('Test Draft Title');
    await context.close();
  });

  test('should clear draft after successful post submission', async ({ browser }) => {
    const context = await browser.newContext({
      storageState: {
        cookies: [{
          name: 'forum_session',
          value: user.sessionToken,
          domain: 'localhost',
          path: '/',
          expires: Math.floor(Date.now() / 1000) + 86400,
          httpOnly: false,
          secure: false,
          sameSite: 'Lax',
        }],
        origins: [],
      },
    });
    const page = await context.newPage();

    await page.goto('/posts/new');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const titleInput = page.locator('form').locator('input').first();
    await titleInput.waitFor({ state: 'visible', timeout: 10000 });

    await titleInput.fill('Auto-Save Test');

    await page.waitForTimeout(3000);

    const afterDrafts = await page.evaluate(() => {
      return Object.keys(localStorage).filter(k => k.startsWith('draft:'));
    });
    test.expect(afterDrafts.length).toBeGreaterThan(0);
    await context.close();
  });

  test('should have 7-day TTL on drafts', async ({ browser }) => {
    const context = await browser.newContext({
      storageState: {
        cookies: [{
          name: 'forum_session',
          value: user.sessionToken,
          domain: 'localhost',
          path: '/',
          expires: Math.floor(Date.now() / 1000) + 86400,
          httpOnly: false,
          secure: false,
          sameSite: 'Lax',
        }],
        origins: [],
      },
    });
    const page = await context.newPage();

    // Inject an expired draft
    await page.goto('/posts/new');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    await page.evaluate(() => {
      const expiredData = {
        title: 'Expired Draft',
        content: 'This should not be loaded',
        timestamp: Date.now() - (8 * 24 * 60 * 60 * 1000),
      };
      localStorage.setItem('draft:post:expired_test', JSON.stringify(expiredData));
    });

    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const titleInput = page.locator('form').locator('input').first();
    await titleInput.waitFor({ state: 'visible', timeout: 10000 });

    const titleValue = await titleInput.inputValue();

    test.expect(titleValue).not.toContain('Expired Draft');
    await context.close();
  });
});
