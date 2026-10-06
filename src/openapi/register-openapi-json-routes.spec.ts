import { registerOpenApiJsonRoutes } from './register-openapi-json-routes';

describe('public OpenAPI JSON routes', () => {
  it.each(['/api/openapi/v1.json', '/api/openapi/public-v1.json'])(
    'serves the committed public contract at %s with HTTP 200',
    (path) => {
      const document = { openapi: '3.0.0', info: { title: 'Public API', version: '1.0.0' }, paths: {} } as any;
      const handlers = new Map<string, (request: unknown, response: any) => unknown>();
      registerOpenApiJsonRoutes({
        getHttpAdapter: () => ({ get: (route: string, handler: (request: unknown, response: any) => unknown) => handlers.set(route, handler) }) as any,
      }, document);

      const response: any = {
        statusCode: 200,
        json(body: unknown) { this.body = body; return this; },
      };
      const handler = handlers.get(path);
      if (!handler) throw new Error(`Route ${path} was not registered`);
      handler({}, response);

      expect(response.statusCode).toBe(200);
      expect(response.body).toBe(document);
    },
  );
});
