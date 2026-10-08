import { AddressInfo } from 'node:net';
import express = require('express');
import { registerDeveloperDocs } from './register-developer-docs';
import { registerOpenApiJsonRoutes } from '../openapi/register-openapi-json-routes';

describe('public API documentation HTTP routes', () => {
  let server: ReturnType<ReturnType<typeof express>['listen']>;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    const document = { openapi: '3.0.0', info: { title: 'Public API', version: '1.0.0' }, paths: {} } as any;
    const nestLikeApp = { getHttpAdapter: () => app } as any;
    registerOpenApiJsonRoutes(nestLikeApp, document);
    registerDeveloperDocs(nestLikeApp, document, '2.6.3');

    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it.each([
    ['/api/v1/docs/changelog', '公开 API 更新记录'],
    ['/api/v1/docs/lifecycle', '公开 V1 API 生命周期'],
    ['/api/v1/docs/errors', '错误代码'],
    ['/api/v1/docs/first-party', '论坛 API V1 参考'],
    ['/api/v1/reference', 'API 参考'],
  ])('returns HTTP 200 for %s', async (path, title) => {
    const response = await fetch(`${baseUrl}${path}`);
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).toContain(title);
  });

  it('returns HTTP 200 and the public document from the OpenAPI route', async () => {
    const response = await fetch(`${baseUrl}/api/openapi/v1.json`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ info: { title: 'Public API', version: '1.0.0' } });
  });

  it('keeps both new Markdown guides linked in the page navigation', async () => {
    const response = await fetch(`${baseUrl}/api/v1/docs/changelog`);
    const body = await response.text();
    expect(body).toContain('href="/api/v1/docs/changelog"');
    expect(body).toContain('href="/api/v1/docs/lifecycle"');
  });
});

describe('developer docs route protection', () => {
  it('keeps the CSP nonce matching the rendered HTML across cached responses', async () => {
    const app = express();
    const document = { openapi: '3.0.0', info: { title: 'Public API', version: '1.0.0' }, paths: {} } as any;
    const nestLikeApp = { getHttpAdapter: () => app } as any;
    registerDeveloperDocs(nestLikeApp, document, '2.6.3');

    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const { port } = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const first = await fetch(`${baseUrl}/api/v1/docs/changelog`);
      const second = await fetch(`${baseUrl}/api/v1/docs/changelog`);

      // The rendered page is cached per process; it must still be served with the
      // CSP header that matches the nonce baked into that HTML, or the stylesheet
      // is blocked and the page renders unstyled.
      const nonceFromHeader = (policy: string | null) => /'nonce-([^']+)'/.exec(policy || '')?.[1];
      const firstPolicy = first.headers.get('content-security-policy');
      const secondPolicy = second.headers.get('content-security-policy');
      expect(nonceFromHeader(firstPolicy)).toBeTruthy();
      expect(nonceFromHeader(secondPolicy)).toBe(nonceFromHeader(firstPolicy));

      const body = await second.text();
      expect(body).toContain(`nonce="${nonceFromHeader(secondPolicy)}"`);
    } finally {
      if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('rate limits documentation reads per client with Retry-After', async () => {
    const app = express();
    const document = { openapi: '3.0.0', info: { title: 'Public API', version: '1.0.0' }, paths: {} } as any;
    const nestLikeApp = { getHttpAdapter: () => app } as any;
    registerDeveloperDocs(nestLikeApp, document, '2.6.3');

    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const { port } = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      let sawRateLimit = false;
      for (let attempt = 0; attempt < 200; attempt += 1) {
        const response = await fetch(`${baseUrl}/api/v1/docs/changelog`);
        if (response.status === 429) {
          expect(response.headers.get('retry-after')).toBeTruthy();
          await expect(response.json()).resolves.toMatchObject({ error: { code: 'RATE_LIMITED' } });
          sawRateLimit = true;
          break;
        }
      }
      expect(sawRateLimit).toBe(true);
    } finally {
      if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
