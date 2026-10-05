import { INestApplication } from '@nestjs/common';
import { OpenAPIObject } from '@nestjs/swagger';

/** Register the public OpenAPI contract at its stable and compatibility paths. */
export function registerOpenApiJsonRoutes(app: Pick<INestApplication, 'getHttpAdapter'>, document: OpenAPIObject): void {
  const adapter = app.getHttpAdapter();
  const serveDocument = (_request: unknown, response: any) => response.json(document);
  adapter.get('/api/openapi/v1.json', serveDocument);
  adapter.get('/api/openapi/public-v1.json', serveDocument);
}
