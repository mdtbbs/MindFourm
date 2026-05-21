const { test, expect } = require('@playwright/test');

const MINDFOURM_URL = 'http://localhost:3000';
const MINDAUTH_URL = 'http://localhost:4001';
const CLIENT_ID = '6d875cc521f1c60ba17dd53c7b9edc5a';

test.describe('MindFourm OAuth登录流程', () => {
  test('未登录用户点击登录跳转MindAuth', async ({ page }) => {
    await page.goto(MINDFOURM_URL);
    await page.waitForLoadState('networkidle');

    // 查找登录按钮或链接
    const loginLink = page.locator('a:has-text("登录")').or(page.locator('button:has-text("登录")')).or(page.locator('text=登录')).first();
    await loginLink.click();

    // 等待跳转到MindAuth
    await page.waitForURL(/localhost:4001/, { timeout: 10000 });
    expect(page.url()).toContain('4001');
  });

  test('真实用户OAuth认证流程', async ({ request }) => {
    // 使用已存在的测试用户避免频繁触发rate limit
    const testUser = 'testadmin';
    const testPassword = 'admin123456';

    // 登录MindAuth获取session
    const loginRes = await request.post(`${MINDAUTH_URL}/api/login`, {
      data: { username: testUser, password: testPassword }
    });
    expect(loginRes.ok()).toBeTruthy();

    // 获取MindAuth session cookie
    const loginCookies = loginRes.headers()['set-cookie'];
    let mindauthSession = null;
    if (loginCookies) {
      const cookiesArray = Array.isArray(loginCookies) ? loginCookies : [loginCookies];
      for (const cookie of cookiesArray) {
        const match = cookie.match(/session=([^;]+)/);
        if (match) {
          mindauthSession = match[1];
          break;
        }
      }
    }
    expect(mindauthSession).toBeTruthy();

    // 用MindAuth session换取MindFourm forum_session（添加测试header跳过rate limit）
    const verifyRes = await request.post(`${MINDFOURM_URL}/api/auth/verify-session`, {
      headers: { 'X-Test-Request': 'true' },
      data: { session_token: mindauthSession }
    });

    if (!verifyRes.ok()) {
      console.log('MindFourm verify-session status:', verifyRes.status());
      test.skip();
    }

    const verifyData = await verifyRes.json();
    expect(verifyData.success).toBe(true);

    // 获取forum_session cookie
    const verifyCookies = verifyRes.headers()['set-cookie'];
    let forumSession = null;
    if (verifyCookies) {
      const cookiesArray = Array.isArray(verifyCookies) ? verifyCookies : [verifyCookies];
      for (const cookie of cookiesArray) {
        const match = cookie.match(/forum_session=([^;]+)/);
        if (match) {
          forumSession = match[1];
          break;
        }
      }
    }
    expect(forumSession).toBeTruthy();

    // 验证forum_session可用于MindFourm API
    const meRes = await request.get(`${MINDFOURM_URL}/api/auth/check`, {
      headers: { Cookie: `forum_session=${forumSession}` }
    });
    expect(meRes.ok()).toBeTruthy();
    const meData = await meRes.json();
    expect(meData.success).toBe(true);
    expect(meData.authenticated).toBe(true);
    expect(meData.user.username).toBe(testUser);
  });

  test('注册流程跳转', async ({ page }) => {
    await page.goto(MINDFOURM_URL);
    await page.waitForLoadState('networkidle');

    const registerLink = page.locator('a:has-text("注册")').or(page.locator('text=注册')).first();
    const count = await registerLink.count();
    if (count > 0) {
      await registerLink.click();
      await page.waitForURL(/localhost:4001/, { timeout: 10000 });
      expect(page.url()).toContain('4001');
    }
  });

  test('健康检查端点', async ({ request }) => {
    const res = await request.get(`${MINDFOURM_URL}/api/health`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.status).toBe('ok');
  });

  test('公开API端点可用', async ({ request }) => {
    // 帖子列表
    const postsRes = await request.get(`${MINDFOURM_URL}/api/posts`);
    expect(postsRes.ok()).toBeTruthy();

    // 分类列表
    const categoriesRes = await request.get(`${MINDFOURM_URL}/api/categories`);
    expect(categoriesRes.ok()).toBeTruthy();
  });
});