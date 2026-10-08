import { INestApplication } from '@nestjs/common';
import { OpenAPIObject } from '@nestjs/swagger';
import { AdapterRouteGuard } from '../common/utils/adapter-route-guard.util';
import { SharedBudget } from '../common/utils/shared-budget.util';
import { getInternalApiKey } from '../config/app.config';

/**
 * Register the public OpenAPI contract at its stable and compatibility paths.
 *
 * This is a plain Express route, not a Nest controller, so the global guards never
 * see it — no ban check, no rate limit, no session resolution. It therefore has to
 * protect itself: the document is serialised on every request (about 1MB), two
 * paths serve the same bytes, and nothing stopped a crawler from spending the whole
 * origin's CPU here. The guard applies a bounded per-client budget and the response
 * is cached, since the document is immutable for the lifetime of the process.
 */
export function registerOpenApiJsonRoutes(app: Pick<INestApplication, 'getHttpAdapter'>, document: OpenAPIObject): void {
  const adapter = app.getHttpAdapter();
  const guard = new AdapterRouteGuard(new SharedBudget(), () => getInternalApiKey());
  // Serialising on every request is pure waste: the document is built once at boot
  // and never mutated, so its JSON form is also fixed for the process lifetime.
  const body = JSON.stringify(document);

  const serveDocument = (request: unknown, response: any) => {
    if (!guard.check(request, response)) return;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    response.status(200).send(body);
  };

  adapter.get('/api/openapi/v1.json', serveDocument);
  adapter.get('/api/openapi/public-v1.json', serveDocument);
}
