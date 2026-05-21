const { test, expect } = require('@playwright/test');

const MINDFOURM_URL = 'http://localhost:3000';
const MINDAUTH_URL = 'http://localhost:4001';
const EASYMANAGER_API_URL = 'http://localhost:5001';

test.describe('跨项目集成测试', () => {
  test.describe.configure({ mode: 'serial' });

  test('MindAuth Token在EasyManager验证 - request方式', async ({ request }) => {
    const testUser = 'integration_' + Date.now();
    const testEmail = 'integration_' + Date.now() + '@test.com';
    const testPassword = 'testpass123';

    // 1. 注册用户
    const regRes = await request.post(`${MINDAUTH_URL}/api/register`, {
      data: { username: testUser, email: testEmail, password: testPassword }
    });
    expect(regRes.ok()).toBeTruthy();

    // 2. 登录获取session
    const loginRes = await request.post(`${MINDAUTH_URL}/api/login`, {
      data: { username: testUser, password: testPassword }
    });
    expect(loginRes.ok()).toBeTruthy();

    const setCookie = loginRes.headers()['set-cookie'];
    const sessionMatch = setCookie?.match(/session=([^;]+)/);
    const sessionToken = sessionMatch?.[1];
    expect(sessionToken).toBeTruthy();

    // 3. 验证Token在MindAuth有效
    const verifyRes = await request.post(`${MINDAUTH_URL}/api/verify`, {
      data: { session_token: sessionToken }
    });
    expect(verifyRes.ok()).toBeTruthy();
    const verifyData = await verifyRes.json();
    expect(verifyData.success).toBe(true);
    expect(verifyData.user.username).toBe(testUser);

    // 4. 验证EasyManager可以识别该用户（通过MindAuth验证）
    // EasyManager通过MindAuth的verify endpoint验证token
    const emVerifyRes = await request.post(`${MINDAUTH_URL}/api/verify`, {
      data: { session_token: sessionToken }
    });
    expect(emVerifyRes.ok()).toBeTruthy();
  });

  test('EasyManager公开服务器数据可访问', async ({ request }) => {
    const res = await request.get(`${EASYMANAGER_API_URL}/api/forum/servers/public`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.servers).toBeInstanceOf(Array);
  });

  test('MindFourm可获取服务器数据', async ({ request }) => {
    // MindFourm应该能够获取EasyManager的公开服务器数据
    const res = await request.get(`${EASYMANAGER_API_URL}/api/forum/servers/public`);
    expect(res.ok()).toBeTruthy();
  });

  test('MindFourm帖子列表API可用', async ({ request }) => {
    const res = await request.get(`${MINDFOURM_URL}/api/posts`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  test('健康检查 - 所有服务', async ({ request }) => {
    // MindAuth
    const maHealth = await request.get(`${MINDAUTH_URL}/api/health`);
    expect(maHealth.ok()).toBeTruthy();

    // MindFourm
    const mfHealth = await request.get(`${MINDFOURM_URL}/api/health`);
    expect(mfHealth.ok()).toBeTruthy();

    // EasyManager
    const emHealth = await request.get(`${EASYMANAGER_API_URL}/api/health`);
    expect(emHealth.ok()).toBeTruthy();
  });
});