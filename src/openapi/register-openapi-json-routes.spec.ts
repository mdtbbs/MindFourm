import { registerOpenApiJsonRoutes } from './register-openapi-json-routes';

function createResponse() {
  const headers: Record<string, string> = {};
  const response: any = {
    headers,
    statusCode: 200,
    body: undefined as unknown,
    setHeader(name: string, value: string) { headers[name] = value; },
    status(code: number) { this.statusCode = code; return this; },
    send(body: unknown) { this.body = body; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
  return response;
}

function register(document: any) {
  const handlers = new Map<string, (request: any, response: any) => unknown>();
  registerOpenApiJsonRoutes({
    getHttpAdapter: () => ({
      get: (route: string, handler: (request: any, response: any) => unknown) => handlers.set(route, handler),
    }) as any,
  }, document);
  return handlers;
}

describe('public OpenAPI JSON routes', () => {
  it.each(['/api/openapi/v1.json', '/api/openapi/public-v1.json'])(
    'serves the committed public contract at %s with HTTP 200',
    (path) => {
      const document = { openapi: '3.0.0', info: { title: 'Public API', version: '1.0.0' }, paths: {} } as any;
      const handlers = register(document);
      const response = createResponse();

      const handler = handlers.get(path);
      if (!handler) throw new Error(`Route ${path} was not registered`);
      handler({ method: 'GET' }, response);

      expect(response.statusCode).toBe(200);
      // The body is the serialised document; it is built once so two paths that
      // serve the same bytes do not each pay for `JSON.stringify` on every hit.
      expect(JSON.parse(response.body as string)).toEqual(document);
    },
  );

  it('marks the document cacheable so crawlers cannot re-serialise it on every hit', () => {
    const handlers = register({ openapi: '3.0.0', info: {}, paths: {} });
    const response = createResponse();
    handlers.get('/api/openapi/v1.json')!({ method: 'GET' }, response);

    expect(response.headers['Content-Type']).toBe('application/json; charset=utf-8');
    expect(response.headers['Cache-Control']).toContain('max-age=3600');
  });

  it('rejects non-GET methods instead of serialising the document for them', () => {
    const handlers = register({ openapi: '3.0.0', info: {}, paths: {} });
    const response = createResponse();
    handlers.get('/api/openapi/v1.json')!({ method: 'POST' }, response);

    expect(response.statusCode).toBe(405);
    expect(response.body).toMatchObject({ code: 'METHOD_NOT_ALLOWED' });
  });
});
