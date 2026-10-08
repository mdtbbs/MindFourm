import { registerOpenApiJsonRoutes } from './register-openapi-json-routes';

describe('public OpenAPI JSON routes', () => {
  it.each(['/api/openapi/v1.json', '/api/openapi/public-v1.json'])(
    'serves the committed public contract at %s with HTTP 200',
    (path) => {
      const document = { openapi: '3.0.0', info: { title: 'Public API', version: '1.0.0' }, paths: {} } as any;
      // Routes are registered as `get(path, rateLimiter, handler)`; capture the
      // final handler so the served body can be asserted directly.
      const handlers = new Map<string, (request: unknown, response: any) => unknown>();
      registerOpenApiJsonRoutes({
        getHttpAdapter: () => ({
          get: (route: string, ...chain: Array<(request: unknown, response: any) => unknown>) => {
            handlers.set(route, chain[chain.length - 1]);
          },
        }) as any,
      }, document);

      const response: any = {
        statusCode: 200,
        status(code: number) { this.statusCode = code; return this; },
        send(body: unknown) { this.body = body; return this; },
        json(body: unknown) { this.body = body; return this; },
        setHeader() {},
      };
      const handler = handlers.get(path);
      if (!handler) throw new Error(`Route ${path} was not registered`);
      handler({}, response);

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body as string)).toEqual(document);
    },
  );
});
