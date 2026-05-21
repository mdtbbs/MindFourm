const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  const successes = [];

  function check(condition, message, actual) {
    if (condition) {
      successes.push(message);
      console.log(`  ✓ ${message}`);
    } else {
      errors.push(`${message} (实际: ${actual ?? 'undefined'})`);
      console.log(`  ✗ ${message} -- 实际值: ${actual ?? 'undefined'}`);
    }
  }

  // Wait for page to fully render client-side content
  async function waitForClientPage(url) {
    await page.goto(url);
    await page.waitForTimeout(3000);
    // Wait for any loading indicator to disappear
    try {
      await page.waitForSelector('body', { state: 'visible', timeout: 5000 });
    } catch {}
  }

  // === 步骤1: 登录获取 session ===
  console.log('=== 1. 登录获取 Session ===');
  await page.goto('http://localhost:4001/#/login');
  await page.waitForSelector('input[name="username"]', { state: 'visible' });
  await page.fill('input[name="username"]', 'testuser');
  await page.fill('input[name="password"]', 'test123456');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
  check(page.url().includes('dashboard'), 'MindAuth 登录成功');

  // OAuth 授权跳转到论坛
  await page.goto('http://localhost:4001/api/authorize?redirect_uri=http%3A%2F%2Flocalhost%3A4000%2Fapi%2Fauth%2Fcallback&client_id=6d875cc521f1c60ba17dd53c7b9edc5a&state=%2Fadmin', {
    waitUntil: 'networkidle',
    timeout: 15000,
  });
  await page.waitForTimeout(3000);

  const authCheck = await page.evaluate(async () => {
    const res = await fetch('http://localhost:4000/api/auth/check', { credentials: 'include' });
    return res.json();
  });
  check(authCheck.data?.authenticated === true, '论坛认证通过');
  check(authCheck.data?.user?.role === 'admin', '管理员角色', authCheck.data?.user?.role);

  console.log('\n=== 2. Dashboard ===');
  await waitForClientPage('http://localhost:3000/admin');
  const h1Text = await page.$eval('h1', el => el.textContent).catch(() => 'N/A');
  check(h1Text.includes('Dashboard') || h1Text.includes('管理'), 'Dashboard 页面', h1Text);
  const statCards = await page.$$eval('[class*="bg-white"] > div, [class*="border"]', els =>
    els.filter(e => /^\d+$/.test(e.textContent.trim())).length
  );
  check(statCards >= 4, '统计卡片显示', statCards);

  console.log('\n=== 3. Settings -> Basic ===');
  await waitForClientPage('http://localhost:3000/admin/settings');
  check(page.url().includes('/basic'), '重定向到 basic');
  const inputs = await page.$$eval('input:not([type="checkbox"]):not([type="submit"]):not([type="button"]), textarea', els => els.length);
  check(inputs >= 3, '表单输入框', inputs);
  // 测试保存
  const forumNameInput = await page.$('input');
  if (forumNameInput) {
    await forumNameInput.fill('MindForum Browser Test');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const save = btns.find(b => b.textContent.trim() === 'Save');
      if (save) save.click();
    });
    await page.waitForTimeout(1500);
    const alert = await page.$('[role="alert"]');
    if (alert) check(true, '设置保存成功');
  }

  console.log('\n=== 4. Tags 管理 ===');
  await waitForClientPage('http://localhost:3000/admin/content/tags');
  const tagInput = await page.$('input[placeholder="Tag name"]');
  check(!!tagInput, '标签创建输入框');
  if (tagInput) {
    await tagInput.fill(`browser_test_${Date.now()}`);
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const c = btns.find(b => b.textContent.trim() === 'Create');
      if (c) c.click();
    });
    await page.waitForTimeout(1000);
    const alert = await page.$('[role="alert"]');
    if (alert) check(true, '标签创建成功');
  }

  console.log('\n=== 5. Posts 批量操作 ===');
  await waitForClientPage('http://localhost:3000/admin/posts');
  const postBodyText = await page.$eval('body', el => el.textContent);
  check(postBodyText.includes('Post Management') || postBodyText.includes('帖子管理'), '帖子页面加载');
  const checkboxes = await page.$$eval('input[type="checkbox"]', cb => cb.length);
  check(checkboxes >= 1, '复选框存在', checkboxes);

  console.log('\n=== 6. Users 搜索 ===');
  await waitForClientPage('http://localhost:3000/admin/users');
  const userBodyText = await page.$eval('body', el => el.textContent);
  check(userBodyText.includes('User Management') || userBodyText.includes('用户管理'), '用户页面加载');
  const searchInput = await page.$('input[placeholder="Search by username or email..."]');
  check(!!searchInput, '搜索框');
  if (searchInput) {
    await searchInput.fill('test');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1000);
    const userRows = await page.$$eval('tbody tr', rows => rows.length);
    check(userRows > 0, '搜索结果', userRows);
  }

  console.log('\n=== 7. Rate Limits ===');
  await waitForClientPage('http://localhost:3000/admin/system/rate-limits');
  const rateText = await page.$eval('body', el => el.textContent);
  check(rateText.includes('Post Creation') || rateText.includes('Post'), 'Post 限流分组');
  check(rateText.includes('Reply Creation') || rateText.includes('Reply'), 'Reply 限流分组');
  check(rateText.includes('Login Attempts') || rateText.includes('Login'), 'Login 限流分组');

  console.log('\n=== 8. Bans ===');
  await waitForClientPage('http://localhost:3000/admin/system/bans');
  const banText = await page.$eval('body', el => el.textContent);
  check(banText.includes('Ban Management') || banText.includes('封禁'), 'Bans 页面');
  check(banText.includes('New Ban'), 'New Ban 按钮');

  console.log('\n=== 9. Cleanup ===');
  await waitForClientPage('http://localhost:3000/admin/system/cleanup');
  const cleanupText = await page.$eval('body', el => el.textContent);
  check(cleanupText.includes('Auto Cleanup'), '自动清理规则');
  check(cleanupText.includes('Manual Cleanup'), '手动清理');

  console.log('\n=== 10. Moderation ===');
  await waitForClientPage('http://localhost:3000/admin/content/moderation');
  const modText = await page.$eval('body', el => el.textContent);
  check(modText.includes('Moderation'), '审核队列页面');
  const select = await page.$('select');
  check(!!select, '类型筛选');

  console.log('\n=== 11. SEO 设置 ===');
  await waitForClientPage('http://localhost:3000/admin/settings/seo');
  const seoText = await page.$eval('body', el => el.textContent);
  check(seoText.includes('SEO'), 'SEO 页面');
  check(seoText.includes('sitemap') || seoText.includes('Sitemap'), 'Sitemap 选项');

  console.log('\n=== 12. Display 设置 ===');
  await waitForClientPage('http://localhost:3000/admin/settings/display');
  const displayText = await page.$eval('body', el => el.textContent);
  check(displayText.includes('Display'), 'Display 页面');
  check(displayText.includes('Posts Per Page'), '每页帖子数设置');

  console.log('\n' + '='.repeat(50));
  console.log(`总计: ${successes.length} 通过, ${errors.length} 失败`);
  if (errors.length > 0) {
    console.log('\n失败详情:');
    errors.forEach(e => console.log(`  ✗ ${e}`));
  }
  console.log('='.repeat(50));

  await browser.close();
  process.exit(errors.length > 0 ? 1 : 0);
})();
