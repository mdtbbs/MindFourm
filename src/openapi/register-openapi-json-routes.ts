import { INestApplication } from '@nestjs/common';
import { OpenAPIObject } from '@nestjs/swagger';
import { createRateLimitMiddleware } from '../common/rate-limit/simple-rate-limiter';
import { AdapterRouteGuard } from '../common/utils/adapter-route-guard.util';
import { SharedBudget } from '../common/utils/shared-budget.util';
import { getInternalApiKey } from '../config/app.config';

/**
 * Register the public OpenAPI contract at its stable and compatibility paths.
 *
 * These routes are mounted directly on the Express adapter, so — unlike every
 * controller route — they never pass through the Nest guard chain. Three things
 * follow from that and are handled here:
 *
 *  • The document is serialized once at boot instead of on every request. The
 *    public contract is close to 1 MB of JSON; re-stringifying it per request was
 *    pure CPU on an endpoint that is trivially cacheable.
 *  • The shared adapter budget (`AdapterRouteGuard` + `SharedBudget`) applies, so a
 *    scraper that reaches these routes still cannot spend the origin's CPU. It also
 *    exempts internal SSR callers, which the Nest chain would have exempted.
 *  • A small in-process per-IP limiter sits in front of it as the cheapest possible
 *    rejection, so a flood is dropped before any shared budget bookkeeping runs.
 */
export function registerOpenApiJsonRoutes(
  app: Pick<INestApplication, 'getHttpAdapter'>,
  document: OpenAPIObject,
): void {
  // `getHttpAdapter()` narrows `get` to the single-handler overload Nest declares,
  // but the underlying Express app accepts a middleware chain. Cast to the shape
  // we actually use rather than loosening every route signature.
  const adapter = app.getHttpAdapter() as unknown as {
    get(path: string, ...handlers: Array<(req: any, res: any, next?: any) => void>): unknown;
  };
  const guard = new AdapterRouteGuard(new SharedBudget(), () => getInternalApiKey());
  // Serialize once. The document is immutable after boot; `res.json()` would
  // otherwise re-run JSON.stringify for every visitor.
  const payload = JSON.stringify(document);

  const limiter = createRateLimitMiddleware({ max: 60, windowMs: 60_000 });

  const serveDocument = (request: unknown, response: any) => {
    // The shared budget is authoritative and cross-process; the middleware above
    // only sheds the cheapest requests first.
    if (!guard.check(request, response)) return;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    // The contract only changes on deploy; let the edge/CDN absorb repeat reads.
    response.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    response.status(200).send(payload);
  };

  adapter.get('/api/openapi/v1.json', limiter, serveDocument);
  adapter.get('/api/openapi/public-v1.json', limiter, serveDocument);
}
