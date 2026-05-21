# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e\specs\integration\server-application.spec.js >> 跨项目集成测试 >> MindAuth Token在EasyManager验证 - request方式
- Location: e2e\specs\integration\server-application.spec.js:10:3

# Error details

```
Error: expect(received).toBeTruthy()

Received: false
```

# Test source

```ts
  1  | const { test, expect } = require('@playwright/test');
  2  | 
  3  | const MINDFOURM_URL = 'http://localhost:3000';
  4  | const MINDAUTH_URL = 'http://localhost:4001';
  5  | const EASYMANAGER_API_URL = 'http://localhost:5001';
  6  | 
  7  | test.describe('跨项目集成测试', () => {
  8  |   test.describe.configure({ mode: 'serial' });
  9  | 
  10 |   test('MindAuth Token在EasyManager验证 - request方式', async ({ request }) => {
  11 |     const testUser = 'integration_' + Date.now();
  12 |     const testEmail = 'integration_' + Date.now() + '@test.com';
  13 |     const testPassword = 'testpass123';
  14 | 
  15 |     // 1. 注册用户
  16 |     const regRes = await request.post(`${MINDAUTH_URL}/api/register`, {
  17 |       data: { username: testUser, email: testEmail, password: testPassword }
  18 |     });
> 19 |     expect(regRes.ok()).toBeTruthy();
     |                         ^ Error: expect(received).toBeTruthy()
  20 | 
  21 |     // 2. 登录获取session
  22 |     const loginRes = await request.post(`${MINDAUTH_URL}/api/login`, {
  23 |       data: { username: testUser, password: testPassword }
  24 |     });
  25 |     expect(loginRes.ok()).toBeTruthy();
  26 | 
  27 |     const setCookie = loginRes.headers()['set-cookie'];
  28 |     const sessionMatch = setCookie?.match(/session=([^;]+)/);
  29 |     const sessionToken = sessionMatch?.[1];
  30 |     expect(sessionToken).toBeTruthy();
  31 | 
  32 |     // 3. 验证Token在MindAuth有效
  33 |     const verifyRes = await request.post(`${MINDAUTH_URL}/api/verify`, {
  34 |       data: { session_token: sessionToken }
  35 |     });
  36 |     expect(verifyRes.ok()).toBeTruthy();
  37 |     const verifyData = await verifyRes.json();
  38 |     expect(verifyData.success).toBe(true);
  39 |     expect(verifyData.user.username).toBe(testUser);
  40 | 
  41 |     // 4. 验证EasyManager可以识别该用户（通过MindAuth验证）
  42 |     // EasyManager通过MindAuth的verify endpoint验证token
  43 |     const emVerifyRes = await request.post(`${MINDAUTH_URL}/api/verify`, {
  44 |       data: { session_token: sessionToken }
  45 |     });
  46 |     expect(emVerifyRes.ok()).toBeTruthy();
  47 |   });
  48 | 
  49 |   test('EasyManager公开服务器数据可访问', async ({ request }) => {
  50 |     const res = await request.get(`${EASYMANAGER_API_URL}/api/forum/servers/public`);
  51 |     expect(res.ok()).toBeTruthy();
  52 |     const data = await res.json();
  53 |     expect(data.success).toBe(true);
  54 |     expect(data.servers).toBeInstanceOf(Array);
  55 |   });
  56 | 
  57 |   test('MindFourm可获取服务器数据', async ({ request }) => {
  58 |     // MindFourm应该能够获取EasyManager的公开服务器数据
  59 |     const res = await request.get(`${EASYMANAGER_API_URL}/api/forum/servers/public`);
  60 |     expect(res.ok()).toBeTruthy();
  61 |   });
  62 | 
  63 |   test('MindFourm帖子列表API可用', async ({ request }) => {
  64 |     const res = await request.get(`${MINDFOURM_URL}/api/posts`);
  65 |     expect(res.ok()).toBeTruthy();
  66 |     const data = await res.json();
  67 |     expect(data.success).toBe(true);
  68 |   });
  69 | 
  70 |   test('健康检查 - 所有服务', async ({ request }) => {
  71 |     // MindAuth
  72 |     const maHealth = await request.get(`${MINDAUTH_URL}/api/health`);
  73 |     expect(maHealth.ok()).toBeTruthy();
  74 | 
  75 |     // MindFourm
  76 |     const mfHealth = await request.get(`${MINDFOURM_URL}/api/health`);
  77 |     expect(mfHealth.ok()).toBeTruthy();
  78 | 
  79 |     // EasyManager
  80 |     const emHealth = await request.get(`${EASYMANAGER_API_URL}/api/health`);
  81 |     expect(emHealth.ok()).toBeTruthy();
  82 |   });
  83 | });
```