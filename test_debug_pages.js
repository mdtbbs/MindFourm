const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Capture console errors
  page.on('console', msg => {
    if (msg.type() === 'error') console.log('  CONSOLE ERROR:', msg.text());
  });
  page.on('pageerror', err => {
    console.log('  PAGE ERROR:', err.message.substring(0, 200));
  });

  // Login
  console.log('=== 登录 ===');
  await page.goto('http://localhost:4001/#/login');
  await page.waitForSelector('input[name="username"]', { state: 'visible' });
  await page.fill('input[name="username"]', 'testuser');
  await page.fill('input[name="password"]', 'test123456');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);

  // OAuth
  await page.goto('http://localhost:4001/api/authorize?redirect_uri=http%3A%2F%2Flocalhost%3A4000%2Fapi%2Fauth%2Fcallback&client_id=6d875cc521f1c60ba17dd53c7b9edc5a', {
    waitUntil: 'networkidle', timeout: 15000,
  });
  await page.waitForTimeout(3000);

  // Check auth
  const authCheck = await page.evaluate(async () => {
    const res = await fetch('http://localhost:4000/api/auth/check', { credentials: 'include' });
    return res.json();
  });
  console.log('认证:', authCheck.data?.authenticated, '角色:', authCheck.data?.user?.role);

  const pagesToTest = [
    { name: 'Posts', url: 'http://localhost:3000/admin/posts' },
    { name: 'Users', url: 'http://localhost:3000/admin/users' },
    { name: 'Bans', url: 'http://localhost:3000/admin/system/bans' },
    { name: 'Moderation', url: 'http://localhost:3000/admin/content/moderation' },
  ];

  for (const p of pagesToTest) {
    console.log(`\n=== ${p.name} (${p.url}) ===`);
    await page.goto(p.url);
    await page.waitForTimeout(4000);
    const status = await page.evaluate(() => {
      const body = document.body;
      return {
        bodyLength: body.innerHTML.length,
        first500: body.innerHTML.substring(0, 500),
        hasError: !!body.querySelector('[role="alert"]')?.textContent,
        hasNextjsError: !!body.querySelector('nextjs-portal'),
      };
    });
    console.log('  Body 长度:', status.bodyLength);
    console.log('  前 500 字符:', status.first500.substring(0, 200));
    if (status.hasError) console.log('  Alert:', status.hasError);
  }

  await browser.close();
})();
