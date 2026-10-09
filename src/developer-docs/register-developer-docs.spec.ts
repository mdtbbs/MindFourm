import { codeTabs, makeContractSamples, registerDeveloperDocs } from './register-developer-docs';

function requestDocumentationRoute(route: string, document: any = {}) {
  let handler: ((request: any, response: any) => void) | undefined;
  const registered = new Map<string, (request: any, response: any) => void>();
  registerDeveloperDocs({
    getHttpAdapter: () => ({
      // Routes register as `get(path, rateLimiter, handler)`. Keep the trailing
      // handler so the page-rendering assertions are unaffected by the limiter.
      get: (registeredRoute: string, ...chain: Array<(request: any, response: any) => void>) => {
        registered.set(registeredRoute, chain[chain.length - 1]);
      },
    }),
  } as any, document, '2.6.1');

  handler = registered.get(route) || (route.startsWith('/api/v1/docs/') ? registered.get('/api/v1/docs/:slug') : undefined);
  if (!handler) throw new Error(`Route ${route} was not registered`);
  const response: any = {
    headers: {},
    setHeader(name: string, value: string) { this.headers[name] = value; },
    status(code: number) { this.statusCode = code; return this; },
    send(body: string) { this.body = body; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
  const slug = route.startsWith('/api/v1/docs/') ? route.slice('/api/v1/docs/'.length) : undefined;
  handler({ params: slug ? { slug } : {}, requestId: 'docs-test' }, response);
  return response;
}

function renderDocumentationRoute(route: string, document: any = {}): string {
  return requestDocumentationRoute(route, document).body;
}

describe('developer docs code samples', () => {
  const document = {} as any;

  it('adds a Python tab and uses params for GET query parameters', () => {
    const samples = makeContractSamples(document, 'GET', '/v1/threads', {
      parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } }],
    }, {});

    expect(codeTabs(samples)).toContain('data-code-tab="python" aria-selected="false">Python</button>');
    expect(samples.python).toContain('requests.get(');
    expect(samples.python).toContain('params={"limit": 20}');
    expect(samples.python).toContain('timeout=30');
  });

  it('uses requests json for JSON request bodies', () => {
    const samples = makeContractSamples(document, 'POST', '/v1/threads', {}, {
      requestBody: {
        content: {
          'application/json': {
            schema: { type: 'object', properties: { title: { type: 'string', example: 'Hello' } }, required: ['title'] },
          },
        },
      },
    });

    expect(samples.python).toContain('json={"title": "Hello"}');
    expect(samples.python).toContain('response.raise_for_status()');
  });

  it('uses OpenAPI multipart fields with files and data arguments', () => {
    const samples = makeContractSamples(document, 'POST', '/v1/resources', {}, {
      requestBody: {
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              properties: {
                file: { type: 'string', format: 'binary' },
                preview: { type: 'string', format: 'binary' },
                title: { type: 'string', example: 'Example resource' },
              },
              required: ['file', 'title'],
            },
          },
        },
      },
    });

    expect(samples.python).toContain('files=files');
    expect(samples.python).toContain('"file": stack.enter_context(open("/path/to/file", "rb"))');
    expect(samples.python).toContain('"preview": stack.enter_context(open("/path/to/file", "rb"))');
    expect(samples.python).toContain('data=data');
    expect(samples.python).toContain('"title": "Example resource"');
  });

  it('includes the Bearer authorization header for secured endpoints', () => {
    const samples = makeContractSamples(document, 'GET', '/v1/messages', {}, {
      security: [{ oauth2: ['messages.read'] }],
    });

    expect(samples.python).toContain('"Authorization": "Bearer <TOKEN>"');
  });

  it('renders a Chinese scenario-first home page', () => {
    const html = renderDocumentationRoute('/api/v1');

    expect(html).toContain('lang="zh-CN"');
    expect(html).toContain('常见开发场景');
    expect(html).toContain('游戏内蓝图与地图浏览');
    expect(html).toContain('先运行一个请求');
    expect(html).toContain('如何使用这些文档');
    expect(html).not.toContain('Build a launcher');
    expect(html).not.toContain('Authentication');
  });

  it('renders compact Chinese API entries with purpose search and readable IDs', () => {
    const html = renderDocumentationRoute('/api/v1/reference', {
      paths: {
        '/v1/resources/{resourceId}': {
          parameters: [{ name: 'resourceId', in: 'path', required: true, schema: { type: 'string' } }],
          get: {
            summary: 'Resource detail',
            tags: ['v1-resources'],
            parameters: [{ name: 'q', in: 'query', schema: { type: 'string', example: 'blueprint' } }],
            security: [{ oauth2: [] }],
            'x-rate-limit': { limit: 60, window_seconds: 60 },
            responses: {
              200: {
                description: 'Public resource list',
                content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'string' } } } } },
              },
              401: { description: '需要有效的 MindAuth access token 或 MDTBBS 登录会话。' },
              default: { description: 'Public V1 error envelope' },
            },
          },
        },
      },
    });

    expect(html).toContain('<details class="endpoint"');
    expect(html).not.toContain('<details class="endpoint" open');
    expect(html).toContain('资源详情。</span>');
    expect(html).toContain('资源中心');
    expect(html).toContain('需要 Bearer 认证');
    expect(html).toContain('params={&quot;q&quot;: &quot;blueprint&quot;}');
    expect(html).toContain('/api/v1/resources/RESOURCE_ID');
    expect(html).toContain('搜索路径、用途、方法或权限范围');
    expect(html).toContain('公开资源列表');
    expect(html).toContain('需要有效的 MindAuth 访问令牌或 MDTBBS 登录会话。');
    expect(html).toContain('公开 V1 错误响应结构');
    expect(html).not.toContain('MindAuth access token');
  });

  it('translates mixed Chinese and English API descriptions for display', () => {
    const html = renderDocumentationRoute('/api/v1/reference', {
      paths: {
        '/v1/game-saves': {
          get: {
            summary: '使用游标分页查看私有 Save Slot；下一页游标位于 meta.next_cursor。',
            responses: {
              401: { description: '需要有效的 MindAuth access token 或 MDTBBS 登录会话。' },
              default: { description: 'Public V1 error envelope' },
            },
          },
        },
      },
    });

    expect(html).toContain('使用游标分页查看私有存档槽');
    expect(html).toContain('需要有效的 MindAuth 访问令牌或 MDTBBS 登录会话。');
    expect(html).toContain('公开 V1 错误响应结构');
    expect(html).not.toContain('Save Slot');
    expect(html).not.toContain('access token');
    expect(html).not.toContain('Public V1 error envelope');
  });
});

describe('developer docs routes', () => {
  it.each([
    ['/api/v1/docs/changelog', '公开 API 更新记录'],
    ['/api/v1/docs/lifecycle', '公开 V1 API 生命周期'],
  ])('renders the Markdown guide %s with its title and navigation', (route, title) => {
    const response = requestDocumentationRoute(route);

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain(`<h1>${title}</h1>`);
    expect(response.body).toContain('href="/api/v1/docs/changelog"');
    expect(response.body).toContain('href="/api/v1/docs/lifecycle"');
  });

  it.each([
    ['/api/v1/docs/errors', '错误代码'],
    ['/api/v1/docs/first-party', '论坛 API V1 参考'],
    ['/api/v1/reference', 'API 参考'],
  ])('preserves the existing documentation route %s', (route, title) => {
    const response = requestDocumentationRoute(route, { paths: {} });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain(title);
  });

  it('serves the public resource ranking algorithms in the online API guide', () => {
    const response = requestDocumentationRoute('/api/v1/docs/resources');

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('资源发现与推荐');
    expect(response.body).toContain('resource-bayesian-rating-v1');
    expect(response.body).toContain('resource-taste-v1');
    expect(response.body).toContain('completed_downloads_7d');
    expect(response.body).toContain('匿名调用不建立个人画像');
  });

  it.each(['/api/docs/v1', '/api/docs/v1/'])(
    'redirects the former Swagger UI entry point %s to the Chinese API reference',
    (route) => {
      let handler: ((request: any, response: any) => void) | undefined;
      registerDeveloperDocs({
        getHttpAdapter: () => ({
          get: (registeredRoute: string, ...chain: Array<(request: any, response: any) => void>) => {
            if (registeredRoute === route) handler = chain[chain.length - 1];
          },
        }),
      } as any, {} as any, '2.6.2');

      if (!handler) throw new Error(`Route ${route} was not registered`);
      const response: any = {
        redirect(status: number, location: string) {
          this.statusCode = status;
          this.location = location;
          return this;
        },
      };

      handler({}, response);

      expect(response.statusCode).toBe(302);
      expect(response.location).toBe('/api/v1/reference');
    },
  );
});
