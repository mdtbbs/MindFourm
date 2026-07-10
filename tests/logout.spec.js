import { test, expect } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000';
const AUTH_URL = process.env.PLAYWRIGHT_AUTH_URL || 'http://127.0.0.1:4001';

test.describe('MindFourm 登出流程', () => {
  test('直接访问 MindAuth 登出页面带 redirect_uri 应跳转到指定页面', async ({ page, context }) => {
    // 清除所有浏览器数据（包括缓存）
    await context.clearCookies();
    await page.route('**/*', async route => {
      // 强制不缓存
      const response = await route.fetch();
      response.headers()['cache-control'] = 'no-store';
      await route.fulfill({ response });
    });

    // 直接访问 MindAuth 登出页面，带 redirect_uri
    const targetUrl = new URL('/categories', BASE_URL).toString();
    await page.goto(`${AUTH_URL}/#/logout?redirect_uri=${encodeURIComponent(targetUrl)}`, { waitUntil: 'domcontentloaded' });

    console.log('Initial URL:', page.url());

    // 等待登出处理（3秒倒计时 + 缓冲）
    await page.waitForTimeout(5000);

    // 检查是否跳转
    const finalUrl = page.url();
    console.log('Final URL:', finalUrl);

    // 验证跳转到目标页面
    expect(finalUrl).toContain(new URL(BASE_URL).origin);
    expect(finalUrl).toContain('categories');
  });
});
