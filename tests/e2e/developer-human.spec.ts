import { expect, test } from '@playwright/test';
import { seedTestData, type TestData } from './fixtures/test-data';
import { collectPageDiagnostics, signInWithSession } from './fixtures/session';

let testData: TestData;

test.beforeAll(async () => {
  testData = await seedTestData();
});

test.afterAll(async () => {
  await testData?.cleanup();
});

test.describe('MindForum Playwright 真人测试', () => {
  test('游客路径：打开首页、帖子、资源和受限页面', async ({ page, request }) => {
    const diagnostics = await collectPageDiagnostics(page);

    await test.step('首页可渲染', async () => {
      await page.goto('/');
      await expect(page).toHaveTitle(/Mind|Forum|BBS|论坛/i);
      await expect(page.getByText('登录').first()).toBeVisible({ timeout: 15_000 });
    });

    await test.step('公开帖子详情可访问', async () => {
      await page.goto(`/posts/${testData.publicPostId}`);
      await expect(page.getByRole('heading', { name: `E2E 初始帖子 ${testData.runId}` })).toBeVisible();
    });

    await test.step('资源列表只向游客展示公开已审核资源', async () => {
      await page.goto(`/resources?search=${testData.runId}`);
      await expect(page.getByText(`E2E Public Resource ${testData.runId}`)).toBeVisible();
      await expect(page.getByText(`E2E Private Resource ${testData.runId}`)).toHaveCount(0);
      await expect(page.getByText(`E2E Pending Resource ${testData.runId}`)).toHaveCount(0);
    });

    await test.step('资源详情接口不向游客暴露 private/pending', async () => {
      const privateRes = await request.get(`/api/v1/resources/${testData.privateResourceId}`);
      const pendingRes = await request.get(`/api/v1/resources/${testData.pendingResourceId}`);
      expect(privateRes.status()).toBe(404);
      expect(pendingRes.status()).toBe(404);
    });

    await test.step('静态资源直链不能绕过鉴权', async () => {
      const backendUrl = process.env.MINDFORUM_BACKEND_URL || 'http://localhost:4000';
      const staticRes = await request.get(`${backendUrl}/uploads/resources/${testData.staticResourceFileName}`);
      expect(staticRes.status()).toBe(404);
    });

    await test.step('受限页面访问不会暴露管理内容', async () => {
      await page.goto('/admin');
      await expect(page.getByText('仪表盘')).toHaveCount(0);
    });

    expect(diagnostics.pageErrors, '页面运行时错误').toEqual([]);
  });

  test('普通用户路径：发帖、回复、私信和资料入口', async ({ browser }) => {
    const context = await browser.newContext();
    await signInWithSession(context, testData.user.sessionToken);
    const page = await context.newPage();
    const diagnostics = await collectPageDiagnostics(page);

    await test.step('登录态首页显示用户信息', async () => {
      await page.goto('/');
      await expect(page.getByText(testData.user.username).first()).toBeVisible({ timeout: 15_000 });
    });

    await test.step('创建帖子应成功且不出现 CSRF 错误', async () => {
      await page.goto('/posts/new');
      await page.getByPlaceholder('请输入帖子标题').fill(`E2E 真人测试发帖 ${testData.runId}`);
      await expect(page.locator('select').first()).toBeVisible({ timeout: 15_000 });
      await page.getByPlaceholder('输入标签，用逗号分隔').fill(`quote' tag, sql) probe`);
      await page.getByPlaceholder('使用 Markdown 格式编写帖子内容...').fill(`这是 Playwright 模拟真人创建的帖子。\n\nRun: ${testData.runId}`);
      await page.getByRole('button', { name: /发布帖子|发布中/ }).click();
      await expect(page.getByText('缺少 CSRF token')).toHaveCount(0);
      await expect(page.getByText('帖子发布成功')).toBeVisible({ timeout: 15_000 });
      await page.getByRole('button', { name: '查看帖子' }).click();
      await expect(page.getByRole('heading', { name: `E2E 真人测试发帖 ${testData.runId}` })).toBeVisible({ timeout: 15_000 });
    });

    await test.step('回复已有帖子应成功且不出现 CSRF 错误', async () => {
      await page.goto(`/posts/${testData.publicPostId}`);
      const textarea = page.getByPlaceholder('使用 Markdown 格式编写回复...');
      await textarea.fill(`E2E 真人测试回复 ${testData.runId}`);
      await page.getByRole('button', { name: /回复|提交|发布/ }).first().click();
      await expect(page.getByText('缺少 CSRF token')).toHaveCount(0);
      await expect(page.getByText(`E2E 真人测试回复 ${testData.runId}`).first()).toBeVisible({ timeout: 15_000 });
    });

    await test.step('私信页可访问并保持登录态', async () => {
      await page.goto('/messages');
      await expect(page.getByRole('heading', { name: '私信' })).toBeVisible();
    });

    expect(diagnostics.pageErrors, '普通用户路径页面运行时错误').toEqual([]);
    await context.close();
  });

  test('管理员路径：后台页面、普通用户拦截和资源管理入口', async ({ browser }) => {
    const adminContext = await browser.newContext();
    await signInWithSession(adminContext, testData.admin.sessionToken);
    const adminPage = await adminContext.newPage();
    const diagnostics = await collectPageDiagnostics(adminPage);

    await test.step('管理员可进入后台', async () => {
      await adminPage.goto('/admin');
      await expect(adminPage.getByText(/仪表盘|Dashboard/).first()).toBeVisible({ timeout: 20_000 });
    });

    await test.step('后台关键页面可打开', async () => {
      const adminPaths = [
        '/admin/users',
        '/admin/posts',
        '/admin/resources',
        '/admin/resources/moderation',
        '/admin/system/bans',
        '/admin/logs',
      ];
      for (const adminPath of adminPaths) {
        await adminPage.goto(adminPath);
        await expect(adminPage.locator('body')).toBeVisible();
      }
    });

    await test.step('普通用户不能访问后台', async () => {
      const userContext = await browser.newContext();
      await signInWithSession(userContext, testData.user.sessionToken);
      const userPage = await userContext.newPage();
      await userPage.goto('/admin');
      await expect(userPage.getByText(/仪表盘|Dashboard/)).toHaveCount(0);
      await userContext.close();
    });

    expect(diagnostics.pageErrors, '管理员路径页面运行时错误').toEqual([]);
    await adminContext.close();
  });
});
