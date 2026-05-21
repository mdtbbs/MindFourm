// @ts-check
const { test } = require('../fixtures/fixtures');
const { createTestIdentity, deleteTestIdentity } = require('../helpers/auth');
const { API_BASE } = require('../helpers/api');

test.describe('8. Resource Center', () => {
  let user;
  let admin;

  test.beforeEach(async () => {
    user = createTestIdentity({ role: 'user' });
    admin = createTestIdentity({ username: `admin_res_${Date.now()}`, role: 'admin' });
  });

  test.afterEach(() => {
    deleteTestIdentity(user.userId);
    deleteTestIdentity(admin.userId);
  });

  test('should list resources (empty)', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/v1/resources`);
    const body = await response.json();

    test.expect(response.status()).toBe(200);
    test.expect(body.success).toBe(true);
    test.expect(body.data).toHaveProperty('data');
    test.expect(body.data).toHaveProperty('next_cursor');
    test.expect(body.data).toHaveProperty('has_more');
  });

  test('should reject resource upload without auth', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    const response = await page.request.post(`${API_BASE}/api/v1/resources`, {
      multipart: {
        file: { name: 'test.txt', mimeType: 'text/plain', buffer: Buffer.from('test') },
        title: 'Test Resource',
        category: 'docs',
      },
    });

    test.expect([400, 401]).toContain(response.status());
    await context.close();
  });

  test('should list resource categories', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/v1/resources/categories`);
    const body = await response.json();

    test.expect(response.status()).toBe(200);
    test.expect(body.success).toBe(true);
    test.expect(Array.isArray(body.data)).toBe(true);
  });

  test('should render resource listing page', async ({ page }) => {
    await page.goto('/resources');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const bodyContent = await page.locator('body').innerText();
    test.expect(bodyContent).toBeTruthy();
  });

  test('should render resource upload page', async ({ page }) => {
    await page.goto('/resources/upload');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const bodyContent = await page.locator('body').innerText();
    test.expect(bodyContent).toBeTruthy();
  });
});
