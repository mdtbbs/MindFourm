import { INestApplication } from '@nestjs/common';
import { OpenAPIObject } from '@nestjs/swagger';
import { createRateLimitMiddleware } from '../common/rate-limit/simple-rate-limiter';

/**
 * Register the public OpenAPI contract at its stable and compatibility paths.
 *
 * These routes are mounted directly on the Express adapter, so — unlike every
 * controller route — they never pass through the Nest guard chain. Two things
 * follow from that and are handled here:
 *
 *  • The document is serialized once at boot instead of on every request. The
 *    public contract is close to 1 MB of JSON; re-stringifying it per request was
 *    pure CPU on an endpoint that is trivially cacheable.
 *  • A small per-IP limiter is applied, because a scraper hitting this endpoint
 *    hard had no guard to stop it and could saturate the event loop.
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
  // Serialize once. The document is immutable after boot; `res.json()` would
  // otherwise re-run JSON.stringify for every visitor.
  const payload = JSON.stringify(document);

  const limiter = createRateLimitMiddleware({ max: 60, windowMs: 60_000 });

  const serveDocument = (_request: unknown, response: any) => {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    // The contract only changes on deploy; let the edge/CDN absorb repeat reads.
    response.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
    response.status(200).send(payload);
  };

  adapter.get('/api/openapi/v1.json', limiter, serveDocument);
  adapter.get('/api/openapi/public-v1.json', limiter, serveDocument);
}
