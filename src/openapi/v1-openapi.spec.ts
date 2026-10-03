import { OpenAPIObject } from '@nestjs/swagger';
import { PUBLIC_V1_OPERATION_ALLOWLIST } from './public-v1-operation-allowlist';
import { filterPublicV1Operations } from './v1-openapi';

function completeFixture(): OpenAPIObject {
  const paths: Record<string, any> = {};
  for (const operationKey of PUBLIC_V1_OPERATION_ALLOWLIST) {
    const separator = operationKey.indexOf(' ');
    const method = operationKey.slice(0, separator).toLowerCase();
    const path = operationKey.slice(separator + 1);
    paths[path] ||= {};
    paths[path][method] = { tags: ['public'], responses: { '200': { description: 'ok' } } };
  }
  paths['/v1/admin/notices'] = {
    get: {
      tags: ['internal'],
      responses: {
        '200': {
          description: 'ok',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/AdminNotice' } } },
        },
      },
    },
  };
  paths['/v1/auth/mobile/exchange'] = { post: { tags: ['internal'], responses: { '201': { description: 'ok' } } } };
  paths['/api/admin/users'] = { get: { tags: ['legacy'], responses: { '200': { description: 'ok' } } } };
  paths['/v1/threads'].get.responses['200'].content = {
    'application/json': { schema: { $ref: '#/components/schemas/PublicThread' } },
  };
  paths['/v1/threads'].get.security = [{ MindAuthBearer: [] }];

  return {
    openapi: '3.0.0',
    info: { title: 'fixture', version: '1.0.0' },
    paths,
    tags: [{ name: 'public' }, { name: 'internal' }, { name: 'legacy' }],
    components: {
      schemas: {
        PublicThread: { type: 'object', properties: { id: { type: 'string' } } },
        AdminNotice: { type: 'object', properties: { secret: { type: 'string' } } },
      },
      securitySchemes: { MindAuthBearer: { type: 'http', scheme: 'bearer' }, InternalKey: { type: 'apiKey', in: 'header', name: 'X-Service-Key' } },
    },
  } as OpenAPIObject;
}

describe('Public V1 OpenAPI operation policy', () => {
  it('keeps only the explicitly approved methods and paths and prunes private schemas', () => {
    const document = filterPublicV1Operations(completeFixture());
    const operations = Object.entries(document.paths).flatMap(([path, item]) =>
      ['get', 'post', 'put', 'patch', 'delete'].flatMap((method) => (item as any)[method] ? [`${method.toUpperCase()} ${path}`] : []),
    );

    expect(operations.sort()).toEqual([...PUBLIC_V1_OPERATION_ALLOWLIST].sort());
    expect(document.paths).not.toHaveProperty('/v1/admin/notices');
    expect(document.paths).not.toHaveProperty('/v1/auth/mobile/exchange');
    expect(document.paths).not.toHaveProperty('/api/admin/users');
    expect(document.components?.schemas).toHaveProperty('PublicThread');
    expect(document.components?.schemas).not.toHaveProperty('AdminNotice');
    expect(document.components?.securitySchemes).toHaveProperty('MindAuthBearer');
    expect(document.components?.securitySchemes).not.toHaveProperty('InternalKey');
    expect(document.tags?.map((tag) => tag.name)).toEqual(['public']);
    expect(document.components?.schemas?.PublicV1ErrorEnvelope).toMatchObject({
      properties: {
        error: { properties: { documentation_url: { type: 'string', format: 'uri' } } },
      },
    });
    expect((document.paths['/v1/threads'] as any).get.responses.default.content['application/json'].schema.$ref)
      .toBe('#/components/schemas/PublicV1ErrorEnvelope');
  });

  it('adds effective default limits when an operation has no explicit override', () => {
    const document = filterPublicV1Operations(completeFixture());
    expect((document.paths['/v1/threads'] as any).get['x-rate-limit']).toEqual({
      limit: 1200,
      window_seconds: 60,
      basis: 'authenticated_user_or_session_or_ip',
    });
  });

  it('fails closed if an approved operation is missing from the internal contract', () => {
    const document = completeFixture();
    delete (document.paths['/v1/threads'] as any).get;
    expect(() => filterPublicV1Operations(document)).toThrow('GET /v1/threads');
  });
});
