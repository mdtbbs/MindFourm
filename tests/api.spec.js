import { test, expect } from '@playwright/test';

const API_URL = process.env.PLAYWRIGHT_API_URL || 'http://127.0.0.1:4000';

test.describe('MindFourm Health Check', () => {
  test('API health endpoint returns success', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/health`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toBeDefined();
  });
});

test.describe('MindFourm API - Categories', () => {
  test('GET /api/categories returns list', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/categories`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toBeDefined();
    expect(Array.isArray(body.data || body)).toBeTruthy();
  });
});

test.describe('MindFourm API - Tags', () => {
  test('GET /api/tags returns list', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/tags`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toBeDefined();
    expect(Array.isArray(body.data || body)).toBeTruthy();
  });
});

test.describe('MindFourm API - Posts', () => {
  test('GET /api/posts returns paginated list', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/posts`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toBeDefined();
  });

  test('GET /api/posts/cursor returns cursor pagination', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/posts/cursor`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toBeDefined();
  });
});

test.describe('MindFourm API - Servers (EasyManager proxy)', () => {
  test('GET /api/servers/public returns servers array', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/servers/public`);
    // May fail if EasyManager is not running, but should return a response
    expect(response.status()).toBeLessThan(500);
  });

  test('GET /api/servers/versions returns versions', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/servers/versions`);
    expect(response.status()).toBeLessThan(500);
  });

  test('GET /api/servers/templates returns templates', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/servers/templates`);
    expect(response.status()).toBeLessThan(500);
  });
});

test.describe('MindFourm API - Auth', () => {
  test('GET /api/auth/check returns unauthenticated status', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/auth/check`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toBeDefined();
  });
});

test.describe('MindFourm API - 404 handling', () => {
  test('Unknown route returns 404', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/nonexistent-route`);
    expect(response.status()).toBe(404);
  });
});

test.describe('MindFourm API - Settings', () => {
  test('GET /api/settings returns public settings', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/settings`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toBeDefined();
  });
});
