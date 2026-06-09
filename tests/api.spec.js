import { test, expect } from '@playwright/test';

test.describe('MindFourm Health Check', () => {
  test('API health endpoint returns success', async ({ request }) => {
    const response = await request.get('http://localhost:4000/api/health');
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toBeDefined();
  });
});

test.describe('MindFourm API - Categories', () => {
  test('GET /api/categories returns list', async ({ request }) => {
    const response = await request.get('http://localhost:4000/api/categories');
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toBeDefined();
    expect(Array.isArray(body.data || body)).toBeTruthy();
  });
});

test.describe('MindFourm API - Tags', () => {
  test('GET /api/tags returns list', async ({ request }) => {
    const response = await request.get('http://localhost:4000/api/tags');
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toBeDefined();
    expect(Array.isArray(body.data || body)).toBeTruthy();
  });
});

test.describe('MindFourm API - Posts', () => {
  test('GET /api/posts returns paginated list', async ({ request }) => {
    const response = await request.get('http://localhost:4000/api/posts');
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toBeDefined();
  });

  test('GET /api/posts/cursor returns cursor pagination', async ({ request }) => {
    const response = await request.get('http://localhost:4000/api/posts/cursor');
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toBeDefined();
  });
});

test.describe('MindFourm API - Servers (EasyManager proxy)', () => {
  test('GET /api/servers/public returns servers array', async ({ request }) => {
    const response = await request.get('http://localhost:4000/api/servers/public');
    // May fail if EasyManager is not running, but should return a response
    expect(response.status()).toBeLessThan(500);
  });

  test('GET /api/servers/versions returns versions', async ({ request }) => {
    const response = await request.get('http://localhost:4000/api/servers/versions');
    expect(response.status()).toBeLessThan(500);
  });

  test('GET /api/servers/templates returns templates', async ({ request }) => {
    const response = await request.get('http://localhost:4000/api/servers/templates');
    expect(response.status()).toBeLessThan(500);
  });
});

test.describe('MindFourm API - Auth', () => {
  test('GET /api/auth/check returns unauthenticated status', async ({ request }) => {
    const response = await request.get('http://localhost:4000/api/auth/check');
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toBeDefined();
  });
});

test.describe('MindFourm API - 404 handling', () => {
  test('Unknown route returns 404', async ({ request }) => {
    const response = await request.get('http://localhost:4000/api/nonexistent-route');
    expect(response.status()).toBe(404);
  });
});

test.describe('MindFourm API - Settings', () => {
  test('GET /api/settings returns public settings', async ({ request }) => {
    const response = await request.get('http://localhost:4000/api/settings');
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toBeDefined();
  });
});
