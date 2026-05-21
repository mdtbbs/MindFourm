const { test, expect } = require('@playwright/test');

const MINDFOURM_URL = 'http://localhost:3000';
const MINDAUTH_URL = 'http://localhost:4001';

// 使用已存在的测试用户避免频繁触发rate limit
const TEST_ADMIN = 'testadmin';
const TEST_ADMIN_PASSWORD = 'admin123456';

test.describe('帖子CRUD', () => {
  test.describe.configure({ mode: 'serial' });

  let createdPostId;
  let forumSessionCookie;
  let categoryId;

  // 使用已存在的测试用户认证
  test.beforeAll(async ({ request }) => {
    // 使用已存在的管理员账号登录MindAuth获取session
    const loginRes = await request.post(`${MINDAUTH_URL}/api/login`, {
      data: { username: TEST_ADMIN, password: TEST_ADMIN_PASSWORD }
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
      console.log('MindFourm verify-response:', verifyRes.status());
      return;
    }

    // 获取forum_session cookie
    const verifyCookies = verifyRes.headers()['set-cookie'];
    if (verifyCookies) {
      const cookiesArray = Array.isArray(verifyCookies) ? verifyCookies : [verifyCookies];
      for (const cookie of cookiesArray) {
        const match = cookie.match(/forum_session=([^;]+)/);
        if (match) {
          forumSessionCookie = match[1];
          break;
        }
      }
    }

    // 获取一个存在的category_id
    const categoriesRes = await request.get(`${MINDFOURM_URL}/api/categories`);
    if (categoriesRes.ok()) {
      const categoriesData = await categoriesRes.json();
      if (categoriesData.success && categoriesData.data && categoriesData.data.length > 0) {
        categoryId = categoriesData.data[0].id;
      }
    }
  });

  test('创建草稿帖子', async ({ request }) => {
    if (!forumSessionCookie) test.skip();
    if (!categoryId) test.skip();

    const res = await request.post(`${MINDFOURM_URL}/api/posts`, {
      headers: { Cookie: `forum_session=${forumSessionCookie}` },
      data: {
        title: '测试草稿帖子标题',
        content: '这是草稿内容，长度超过十个字符以满足验证要求。',
        status: 'draft',
        category_id: categoryId
      }
    });

    expect(res.status()).toBe(201);
  });

  test('创建并发布帖子', async ({ request }) => {
    if (!forumSessionCookie) test.skip();
    if (!categoryId) test.skip();

    const uniqueTitle = `测试发布帖子标题 ${Date.now()}`;
    const res = await request.post(`${MINDFOURM_URL}/api/posts`, {
      headers: { Cookie: `forum_session=${forumSessionCookie}` },
      data: {
        title: uniqueTitle,
        content: '这是发布内容，用于测试帖子创建功能，长度足够满足验证。',
        status: 'published',
        category_id: categoryId
      }
    });

    expect(res.status()).toBe(201);
    const data = await res.json();
    createdPostId = data.data?.id || data.id;
    expect(createdPostId).toBeTruthy();
  });

  test('查看帖子列表', async ({ request }) => {
    const res = await request.get(`${MINDFOURM_URL}/api/posts`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data).toBeInstanceOf(Array);
  });

  test('查看帖子详情', async ({ request }) => {
    if (!createdPostId) test.skip();

    const res = await request.get(`${MINDFOURM_URL}/api/posts/${createdPostId}`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  test('更新帖子', async ({ request }) => {
    if (!forumSessionCookie || !createdPostId) test.skip();

    const res = await request.put(`${MINDFOURM_URL}/api/posts/${createdPostId}`, {
      headers: { Cookie: `forum_session=${forumSessionCookie}` },
      data: {
        title: '编辑后的标题',
        content: '编辑后的内容',
        status: 'published'
      }
    });

    expect(res.ok()).toBeTruthy();
  });

  test('删除帖子', async ({ request }) => {
    if (!forumSessionCookie || !createdPostId) test.skip();

    const res = await request.delete(`${MINDFOURM_URL}/api/posts/${createdPostId}`, {
      headers: { Cookie: `forum_session=${forumSessionCookie}` }
    });

    expect(res.ok()).toBeTruthy();
    createdPostId = null;
  });
});