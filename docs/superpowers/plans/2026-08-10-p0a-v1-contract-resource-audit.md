# P0-A V1 Contract and Resource Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the smallest production-safe V1 contract foundation and a read-only Legacy Resource audit, so the next Resource Core plan can add schema only after proving current data shape and compatibility risks.

**Architecture:** Keep the existing NestJS modular monolith and global `/api` prefix. Add V1-specific transport metadata to the existing global response and exception paths, reuse `SettingsService` for coarse global V1 rollout flags, expose a minimal `/api/v1/capabilities` endpoint, and add a compiled read-only resource audit CLI. This plan creates no Resource aggregate tables, no Backfill state table, no Device Auth, no Outbox, and no delivery/storage abstraction.

**Tech Stack:** NestJS 10, TypeScript 5, TypeORM 0.3/MySQL 8, Jest/ts-jest, Next.js 15 consumer compatibility, `@nestjs/swagger` compatible with NestJS 10.

## Global Constraints

- Preserve the existing `/api/*` response envelope: `{ success: true, data }` on success and `{ success: false, code?, message }` on errors.
- `/api/v1/*` JSON success responses use `{ data, meta: { request_id } }`; V1 errors use `{ error: { code, message, retryable, details }, meta: { request_id } }`.
- Streams, redirects, SSE, binary media, and 204 responses must bypass JSON success serialization.
- Keep the app's global `/api` prefix from `src/main.ts`; `@Controller('v1/...')` therefore resolves to `/api/v1/...`.
- Reuse `SettingsService` for coarse global flags. Do not create a `feature_flags` table.
- The audit command must execute `SELECT` statements only and must not create tables, update rows, run migrations, or invoke Resource write services.
- Do not add `outbox_events`, `backfill_runs`, `client_sessions`, ResourceFile, Media, or Object Storage code in this plan.
- Do not move existing Web routes or change current resource endpoints.
- Do not commit unless the user explicitly authorizes a commit. End each task with a review checkpoint instead.
- Use Node's built-in `crypto.randomUUID()`; do not add a UUID dependency.

---

## File Structure

### Existing files to modify

| File | Responsibility after this plan |
|---|---|
| `src/main.ts` | Register the request-ID middleware and conditionally expose V1 OpenAPI documentation. |
| `src/common/interceptors/response.interceptor.ts` | Preserve Legacy envelopes while serializing ordinary V1 JSON responses and bypassing raw transports. |
| `src/common/filters/all-exceptions.filter.ts` | Emit the V1 error contract for V1 requests while preserving Legacy errors. |
| `src/modules/settings/settings.service.ts` | Seed and group two coarse Resource V1 Settings flags. |
| `src/app.module.ts` | Register the new lightweight capabilities module. |
| `src/database/migrations/index.ts` | Remains unchanged in this plan; it is explicitly listed to prevent accidental migration addition. |
| `package.json` | Add the backend audit script and the Nest 10-compatible Swagger dependency. |

### Files to create

| File | Responsibility |
|---|---|
| `src/common/contracts/api-v1.contract.ts` | Exact V1 success/error types and constructors. |
| `src/common/decorators/api-v1.decorator.ts` | `@ApiV1()` and `@RawHttpResponse()` metadata decorators. |
| `src/common/middleware/request-id.middleware.ts` | Generate/propagate an opaque request ID and set `X-Request-Id`. |
| `src/common/exceptions/api-v1.exception.ts` | Typed V1 HTTP exception with stable code, retryability, and details. |
| `src/openapi/v1-openapi.ts` | Build an OpenAPI document containing explicitly included V1 modules. |
| `src/modules/capabilities/capabilities.module.ts` | Wire the capabilities controller/service. |
| `src/modules/capabilities/capabilities.service.ts` | Resolve coarse V1 capabilities from Settings. |
| `src/modules/capabilities/capabilities.controller.ts` | Serve `GET /api/v1/capabilities`. |
| `src/scripts/resource-migration-audit.report.ts` | Build a typed read-only Legacy Resource audit from query results. |
| `src/scripts/resource-migration-audit.ts` | Initialize the CLI DataSource, run the report, print JSON, and close cleanly. |
| `src/common/interceptors/response.interceptor.spec.ts` | Verify Legacy, V1, SSE, and raw serialization paths. |
| `src/common/filters/all-exceptions.filter.spec.ts` | Verify V1 error shape and Legacy error compatibility. |
| `src/common/middleware/request-id.middleware.spec.ts` | Verify trusted request-ID propagation/generation and response header behavior. |
| `src/modules/capabilities/capabilities.service.spec.ts` | Verify Settings-backed capability resolution. |
| `src/modules/capabilities/capabilities.controller.spec.ts` | Verify V1 controller metadata and returned capability DTO. |
| `src/scripts/resource-migration-audit.report.spec.ts` | Verify audit calculations against Legacy dirty-data query fixtures. |

## Interfaces Produced by This Plan

```ts
// src/common/contracts/api-v1.contract.ts
export type ApiV1Meta = { request_id: string };
export type ApiV1Success<T> = { data: T; meta: ApiV1Meta };
export type ApiV1Error = {
  error: {
    code: string;
    message: string;
    retryable: boolean;
    details: unknown[];
  };
  meta: ApiV1Meta;
};
export function apiV1Success<T>(data: T, requestId: string): ApiV1Success<T>;
export function apiV1Error(
  code: string,
  message: string,
  retryable: boolean,
  details: unknown[],
  requestId: string,
): ApiV1Error;
```

```ts
// src/common/decorators/api-v1.decorator.ts
export const API_V1_CONTRACT = 'mdtbbs:api-v1';
export const RAW_HTTP_RESPONSE = 'mdtbbs:raw-http-response';
export function ApiV1(): MethodDecorator & ClassDecorator;
export function RawHttpResponse(): MethodDecorator & ClassDecorator;
```

```ts
// src/modules/capabilities/capabilities.service.ts
export type ClientCapabilities = {
  resource_read: boolean;
  resource_files: boolean;
  download_grants: boolean;
  device_auth: boolean;
  notifications_v1: boolean;
  forge_preview: boolean;
  minimum_supported_client_version: string | null;
  recommended_client_version: string | null;
};
export class CapabilitiesService {
  getCapabilities(): Promise<ClientCapabilities>;
}
```

```ts
// src/scripts/resource-migration-audit.report.ts
export type ResourceMigrationAuditReport = {
  generated_at: string;
  counts: Record<string, number>;
  anomalies: Record<string, number>;
  legacy_download_baseline: number;
};
export function buildResourceMigrationAudit(
  query: (sql: string, parameters?: unknown[]) => Promise<Array<Record<string, unknown>>>,
  generatedAt: Date,
): Promise<ResourceMigrationAuditReport>;
```

---

### Task 1: Add request IDs and V1 transport contracts

**Files:**
- Create: `src/common/contracts/api-v1.contract.ts`
- Create: `src/common/decorators/api-v1.decorator.ts`
- Create: `src/common/exceptions/api-v1.exception.ts`
- Create: `src/common/middleware/request-id.middleware.ts`
- Create: `src/common/middleware/request-id.middleware.spec.ts`
- Create: `src/common/interceptors/response.interceptor.spec.ts`
- Create: `src/common/filters/all-exceptions.filter.spec.ts`
- Modify: `src/main.ts:88-108`
- Modify: `src/common/interceptors/response.interceptor.ts:1-21`
- Modify: `src/common/filters/all-exceptions.filter.ts:1-37`

**Interfaces:**
- Consumes: existing Nest global middleware/interceptor/filter registration in `src/main.ts`.
- Produces: `ApiV1`, `RawHttpResponse`, `apiV1Success`, `apiV1Error`, `ApiV1Exception`, and `req.requestId` for Task 2.

- [ ] **Step 1: Write the failing request-ID middleware tests**

Create `src/common/middleware/request-id.middleware.spec.ts`:

```ts
import { requestIdMiddleware } from './request-id.middleware';

describe('requestIdMiddleware', () => {
  it('uses a valid inbound X-Request-Id and echoes it on the response', () => {
    const req: any = { headers: { 'x-request-id': 'req-inbound-42' } };
    const setHeader = jest.fn();
    const res: any = { setHeader };
    const next = jest.fn();

    requestIdMiddleware(req, res, next);

    expect(req.requestId).toBe('req-inbound-42');
    expect(setHeader).toHaveBeenCalledWith('X-Request-Id', 'req-inbound-42');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('generates a UUID when the inbound header is absent', () => {
    const req: any = { headers: {} };
    const res: any = { setHeader: jest.fn() };

    requestIdMiddleware(req, res, jest.fn());

    expect(req.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});
```

- [ ] **Step 2: Run the request-ID test to verify it fails**

Run:

```bash
npm test -- --runInBand src/common/middleware/request-id.middleware.spec.ts
```

Expected: FAIL because `request-id.middleware.ts` does not exist.

- [ ] **Step 3: Implement the request-ID middleware**

Create `src/common/middleware/request-id.middleware.ts`:

```ts
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

declare module 'express-serve-static-core' {
  interface Request {
    requestId?: string;
  }
}

const VALID_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const inbound = req.header('x-request-id');
  const requestId = inbound && VALID_REQUEST_ID.test(inbound) ? inbound : randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}
```

Modify `src/main.ts` immediately after the cookie parsing middleware and before `csrfMiddleware`:

```ts
import { requestIdMiddleware } from './common/middleware/request-id.middleware';

// ...after cookie parsing middleware
app.use(requestIdMiddleware);
app.use(csrfMiddleware);
```

- [ ] **Step 4: Write failing V1 and Legacy response-interceptor tests**

Create `src/common/interceptors/response.interceptor.spec.ts` with a helper that subscribes to the observable returned by `intercept`:

```ts
import { of, firstValueFrom } from 'rxjs';
import { ResponseInterceptor } from './response.interceptor';
import { ApiV1, RawHttpResponse } from '../decorators/api-v1.decorator';

class LegacyHandler {
  json() {}
}

class V1Handler {
  @ApiV1()
  json() {}

  @ApiV1()
  @RawHttpResponse()
  raw() {}
}

describe('ResponseInterceptor', () => {
  const interceptor = new ResponseInterceptor();
  const legacyHandler = new LegacyHandler();
  const v1Handler = new V1Handler();

  const contextFor = (
    target: object,
    method: string,
    headers: Record<string, string> = {},
  ) => ({
    switchToHttp: () => ({ getRequest: () => ({ headers, requestId: 'req-123' }) }),
    getHandler: () => (target as any)[method],
    getClass: () => target.constructor,
  }) as any;

  it('preserves the Legacy success envelope', async () => {
    const result = await firstValueFrom(interceptor.intercept(
      contextFor(legacyHandler, 'json'),
      { handle: () => of({ id: 7 }) },
    ));

    expect(result).toEqual({ success: true, data: { id: 7 } });
  });

  it('serializes a V1 JSON handler as data plus request metadata', async () => {
    const result = await firstValueFrom(interceptor.intercept(
      contextFor(v1Handler, 'json'),
      { handle: () => of({ id: 7 }) },
    ));

    expect(result).toEqual({ data: { id: 7 }, meta: { request_id: 'req-123' } });
  });

  it('does not wrap a V1 raw handler', async () => {
    const payload = Buffer.from('binary');
    const result = await firstValueFrom(interceptor.intercept(
      contextFor(v1Handler, 'raw'),
      { handle: () => of(payload) },
    ));

    expect(result).toBe(payload);
  });

  it('does not wrap an SSE request', async () => {
    const result = await firstValueFrom(interceptor.intercept(
      contextFor(v1Handler, 'json', { accept: 'text/event-stream' }),
      { handle: () => of({ type: 'notification' }) },
    ));

    expect(result).toEqual({ type: 'notification' });
  });
});
```

- [ ] **Step 5: Run the interceptor test to verify it fails**

Run:

```bash
npm test -- --runInBand src/common/interceptors/response.interceptor.spec.ts
```

Expected: FAIL because V1 decorators and V1 envelope handling do not exist.

- [ ] **Step 6: Implement V1 contract helpers, metadata decorators, and interceptor behavior**

Create `src/common/contracts/api-v1.contract.ts`:

```ts
export type ApiV1Meta = { request_id: string };

export type ApiV1Success<T> = {
  data: T;
  meta: ApiV1Meta;
};

export type ApiV1Error = {
  error: {
    code: string;
    message: string;
    retryable: boolean;
    details: unknown[];
  };
  meta: ApiV1Meta;
};

export function apiV1Success<T>(data: T, requestId: string): ApiV1Success<T> {
  return { data, meta: { request_id: requestId } };
}

export function apiV1Error(
  code: string,
  message: string,
  retryable: boolean,
  details: unknown[],
  requestId: string,
): ApiV1Error {
  return { error: { code, message, retryable, details }, meta: { request_id: requestId } };
}
```

Create `src/common/decorators/api-v1.decorator.ts`:

```ts
import { SetMetadata } from '@nestjs/common';

export const API_V1_CONTRACT = 'mdtbbs:api-v1';
export const RAW_HTTP_RESPONSE = 'mdtbbs:raw-http-response';

export function ApiV1(): MethodDecorator & ClassDecorator {
  return SetMetadata(API_V1_CONTRACT, true);
}

export function RawHttpResponse(): MethodDecorator & ClassDecorator {
  return SetMetadata(RAW_HTTP_RESPONSE, true);
}
```

Create `src/common/exceptions/api-v1.exception.ts`:

```ts
import { HttpException, HttpStatus } from '@nestjs/common';

export class ApiV1Exception extends HttpException {
  constructor(
    readonly code: string,
    status: HttpStatus,
    message: string,
    readonly retryable = false,
    readonly details: unknown[] = [],
  ) {
    super({ code, message, retryable, details }, status);
  }
}
```

Replace `ResponseInterceptor.intercept` with metadata-aware behavior:

```ts
const request = context.switchToHttp().getRequest();
const handler = context.getHandler();
const controller = context.getClass();
const isV1 = [handler, controller].some((target) =>
  Reflect.getMetadata(API_V1_CONTRACT, target) === true,
);
const isRaw = [handler, controller].some((target) =>
  Reflect.getMetadata(RAW_HTTP_RESPONSE, target) === true,
);
const isSse = typeof request?.headers?.accept === 'string'
  && request.headers.accept.includes('text/event-stream');

if (isRaw || isSse) return next.handle();

return next.handle().pipe(
  map((data) => isV1
    ? apiV1Success(data, request.requestId)
    : { success: true, data }),
);
```

Import the contract and metadata constants instead of duplicating string literals.

- [ ] **Step 7: Write failing V1 exception-filter tests**

Create `src/common/filters/all-exceptions.filter.spec.ts`:

```ts
import { BadRequestException, HttpStatus } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { ApiV1Exception } from '../exceptions/api-v1.exception';

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  const hostFor = (path: string) => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    return {
      response: { status },
      json,
      host: {
        switchToHttp: () => ({
          getRequest: () => ({ originalUrl: path, requestId: 'req-500' }),
          getResponse: () => ({ status }),
        }),
      } as any,
    };
  };

  it('returns the V1 error envelope for an ApiV1Exception', () => {
    const { host, response, json } = hostFor('/api/v1/resources');

    filter.catch(new ApiV1Exception(
      'RESOURCE_FILE_NOT_READY',
      HttpStatus.CONFLICT,
      '资源文件暂不可用',
      true,
      [{ field: 'availability_status' }],
    ), host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'RESOURCE_FILE_NOT_READY',
        message: '资源文件暂不可用',
        retryable: true,
        details: [{ field: 'availability_status' }],
      },
      meta: { request_id: 'req-500' },
    });
  });

  it('preserves the Legacy error envelope outside /api/v1', () => {
    const { host, response, json } = hostFor('/api/resources');

    filter.catch(new BadRequestException('旧接口参数错误'), host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith({
      success: false,
      message: '旧接口参数错误',
    });
  });
});
```

- [ ] **Step 8: Run the exception-filter test to verify it fails**

Run:

```bash
npm test -- --runInBand src/common/filters/all-exceptions.filter.spec.ts
```

Expected: FAIL because the filter always emits the Legacy error format.

- [ ] **Step 9: Implement V1 error serialization without changing Legacy errors**

In `AllExceptionsFilter.catch`:

1. Read `request.originalUrl` and `request.requestId` from the HTTP context.
2. Treat URLs beginning with `/api/v1/` as V1 requests.
3. When the exception is `ApiV1Exception`, emit `apiV1Error(exception.code, exception.message, exception.retryable, exception.details, requestId)`.
4. For other V1 `HttpException`s, emit code `VALIDATION_FAILED` for status 400 and `HTTP_ERROR` for other statuses; set `retryable` to `true` only for 429 and 5xx; convert a validation array to `details` and otherwise use `[]`.
5. For unhandled V1 exceptions, log the original error server-side and emit `INTERNAL_ERROR`, status 500, retryable `true`, and empty details.
6. Keep the exact existing Legacy branches unchanged for all non-V1 requests.

- [ ] **Step 10: Run contract tests and the backend build**

Run:

```bash
npm test -- --runInBand src/common/middleware/request-id.middleware.spec.ts src/common/interceptors/response.interceptor.spec.ts src/common/filters/all-exceptions.filter.spec.ts
npm run build:backend
```

Expected: all three test files PASS and the backend TypeScript build exits with code 0.

- [ ] **Step 11: Review checkpoint**

Run:

```bash
git diff --check
git diff -- src/main.ts src/common
```

Expected: no whitespace errors; Legacy response and error behavior changes are limited to V1 metadata/path handling. Do not commit without explicit user authorization.

---

### Task 2: Add Settings-backed V1 capabilities and OpenAPI baseline

**Files:**
- Create: `src/modules/capabilities/capabilities.module.ts`
- Create: `src/modules/capabilities/capabilities.service.ts`
- Create: `src/modules/capabilities/capabilities.controller.ts`
- Create: `src/modules/capabilities/capabilities.service.spec.ts`
- Create: `src/modules/capabilities/capabilities.controller.spec.ts`
- Create: `src/openapi/v1-openapi.ts`
- Modify: `src/modules/settings/settings.service.ts:316-411,430-545`
- Modify: `src/app.module.ts:7-117`
- Modify: `src/main.ts:1-18,140-146`
- Modify: `package.json:5-25,26-50`

**Interfaces:**
- Consumes: `ApiV1`, `ApiV1Success`, request IDs from Task 1; `SettingsService.getBoolean` from the existing Settings module.
- Produces: `GET /api/v1/capabilities`, two coarse Settings flags, and OpenAPI documentation for V1 endpoints.

- [ ] **Step 1: Install a NestJS 10-compatible Swagger package**

Run:

```bash
npm install @nestjs/swagger@^7.4.2
```

Expected: `package.json` and lockfile list `@nestjs/swagger`; no unrelated dependency upgrades are accepted.

- [ ] **Step 2: Write the failing capabilities-service test**

Create `src/modules/capabilities/capabilities.service.spec.ts`:

```ts
import { CapabilitiesService } from './capabilities.service';

describe('CapabilitiesService', () => {
  it('uses SettingsService for the coarse resource V1 read capability', async () => {
    const settings = {
      getBoolean: jest.fn(async (key: string, fallback: boolean) => {
        if (key === 'feature_resources_v1_read_enabled') return true;
        return fallback;
      }),
    } as any;

    const service = new CapabilitiesService(settings);

    await expect(service.getCapabilities()).resolves.toEqual({
      resource_read: true,
      resource_files: false,
      download_grants: false,
      device_auth: false,
      notifications_v1: false,
      forge_preview: false,
      minimum_supported_client_version: null,
      recommended_client_version: null,
    });
    expect(settings.getBoolean).toHaveBeenCalledWith('feature_resources_v1_read_enabled', false);
  });
});
```

- [ ] **Step 3: Run the capabilities-service test to verify it fails**

Run:

```bash
npm test -- --runInBand src/modules/capabilities/capabilities.service.spec.ts
```

Expected: FAIL because the capabilities module does not exist.

- [ ] **Step 4: Implement coarse Settings flags and the capabilities service**

In `SettingsService.seedDefaults`, add these two values inside the existing `features` group:

```ts
{ key: 'feature_resources_v1_read_enabled', value: 'false', category: 'features', description: 'Enable V1 resource read APIs' },
{ key: 'feature_resources_v1_detail_enabled', value: 'false', category: 'features', description: 'Enable the Web V1 resource detail UI' },
```

Add both keys to `categoryKeyGroups.features`. Do **not** add them to `PUBLIC_KEYS`; clients learn capabilities through the controller rather than receiving unrestricted settings.

Create `src/modules/capabilities/capabilities.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';

export type ClientCapabilities = {
  resource_read: boolean;
  resource_files: boolean;
  download_grants: boolean;
  device_auth: boolean;
  notifications_v1: boolean;
  forge_preview: boolean;
  minimum_supported_client_version: string | null;
  recommended_client_version: string | null;
};

@Injectable()
export class CapabilitiesService {
  constructor(private readonly settingsService: SettingsService) {}

  async getCapabilities(): Promise<ClientCapabilities> {
    return {
      resource_read: await this.settingsService.getBoolean('feature_resources_v1_read_enabled', false),
      resource_files: false,
      download_grants: false,
      device_auth: false,
      notifications_v1: false,
      forge_preview: false,
      minimum_supported_client_version: null,
      recommended_client_version: null,
    };
  }
}
```

Create `src/modules/capabilities/capabilities.module.ts` importing `SettingsModule`, registering `CapabilitiesService` and `CapabilitiesController`, and exporting `CapabilitiesService`.

- [ ] **Step 5: Write the failing V1 capabilities-controller test**

Create `src/modules/capabilities/capabilities.controller.spec.ts`:

```ts
import 'reflect-metadata';
import { API_V1_CONTRACT } from '../../common/decorators/api-v1.decorator';
import { CapabilitiesController } from './capabilities.controller';

describe('CapabilitiesController', () => {
  it('is marked as a V1 controller and returns the service result', async () => {
    const service = {
      getCapabilities: jest.fn(async () => ({ resource_read: false })),
    } as any;
    const controller = new CapabilitiesController(service);

    await expect(controller.getCapabilities()).resolves.toEqual({ resource_read: false });
    expect(Reflect.getMetadata(API_V1_CONTRACT, CapabilitiesController)).toBe(true);
  });
});
```

- [ ] **Step 6: Run the controller test to verify it fails**

Run:

```bash
npm test -- --runInBand src/modules/capabilities/capabilities.controller.spec.ts
```

Expected: FAIL because the controller does not exist.

- [ ] **Step 7: Implement the V1 capabilities endpoint**

Create `src/modules/capabilities/capabilities.controller.ts`:

```ts
import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOkResponse } from '@nestjs/swagger';
import { ApiV1 } from '../../common/decorators/api-v1.decorator';
import { CapabilitiesService, ClientCapabilities } from './capabilities.service';

@ApiV1()
@ApiTags('v1-capabilities')
@Controller('v1/capabilities')
export class CapabilitiesController {
  constructor(private readonly capabilitiesService: CapabilitiesService) {}

  @Get()
  @ApiOkResponse({ description: 'Current first-party API capabilities' })
  getCapabilities(): Promise<ClientCapabilities> {
    return this.capabilitiesService.getCapabilities();
  }
}
```

Import `CapabilitiesModule` in `AppModule` immediately after `SettingsModule`.

- [ ] **Step 8: Implement the V1 OpenAPI document factory and conditional docs route**

Create `src/openapi/v1-openapi.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { CapabilitiesModule } from '../modules/capabilities/capabilities.module';

export function createV1OpenApiDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('MDTBBS First-party API')
    .setDescription('Stable V1 contract for MDTBBS first-party clients')
    .setVersion('1.0.0')
    .build();

  return SwaggerModule.createDocument(app, config, { include: [CapabilitiesModule] });
}
```

In `src/main.ts`, after app initialization and before `app.listen`, add:

```ts
if (process.env.OPENAPI_ENABLED === 'true') {
  const document = createV1OpenApiDocument(app);
  SwaggerModule.setup('api/docs/v1', app, document);
}
```

Import `SwaggerModule` and `createV1OpenApiDocument`. The docs route is disabled unless `OPENAPI_ENABLED=true` and initially contains only explicitly included V1 modules.

- [ ] **Step 9: Run capability tests and build**

Run:

```bash
npm test -- --runInBand src/modules/capabilities/capabilities.service.spec.ts src/modules/capabilities/capabilities.controller.spec.ts
npm run build:backend
```

Expected: both tests PASS and the backend build exits with code 0.

- [ ] **Step 10: Verify OpenAPI manually with a local configured environment**

Run:

```powershell
$env:OPENAPI_ENABLED = 'true'; npm run dev
```

Then request:

```text
GET http://localhost:4000/api/v1/capabilities
GET http://localhost:4000/api/docs/v1
```

Expected: capabilities response uses the V1 envelope with `meta.request_id`; Swagger UI loads and contains the V1 capabilities endpoint. Stop the development process after verification.

- [ ] **Step 11: Review checkpoint**

Run:

```bash
git diff --check
git diff -- package.json src/modules/settings src/modules/capabilities src/openapi src/app.module.ts src/main.ts
```

Expected: no schema migration or new feature-flag table was introduced. Do not commit without explicit user authorization.

---

### Task 3: Add a read-only Legacy Resource migration audit CLI

**Files:**
- Create: `src/scripts/resource-migration-audit.report.ts`
- Create: `src/scripts/resource-migration-audit.ts`
- Create: `src/scripts/resource-migration-audit.report.spec.ts`
- Modify: `package.json:5-25`

**Interfaces:**
- Consumes: the existing TypeORM CLI DataSource exported by `src/database/data-source.ts`; current Resource/Version table names.
- Produces: `npm run audit:resources`, which prints a typed JSON report without mutating MySQL.

- [ ] **Step 1: Write the failing report-builder test**

Create `src/scripts/resource-migration-audit.report.spec.ts`:

```ts
import { buildResourceMigrationAudit } from './resource-migration-audit.report';

describe('buildResourceMigrationAudit', () => {
  it('reports counts, Legacy anomalies, and the historical download baseline', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes("SUM(`download_count`)")) return [{ count: 1382 }];
      if (sql.includes("FROM `resource_versions`")) return [{ count: 9 }];
      if (sql.includes("`resource_type` = 'external'")) return [{ count: 3 }];
      if (sql.includes("`use_mfl` = 1")) return [{ count: 4 }];
      if (sql.includes("TRIM(COALESCE(`version`, '')) = ''")) return [{ count: 2 }];
      if (sql.includes("`file_path` IS NULL")) return [{ count: 5 }];
      if (sql.includes("FROM `resources` WHERE `deleted_at` IS NULL")) return [{ count: 12 }];
      return [{ count: 0 }];
    });

    await expect(buildResourceMigrationAudit(query, new Date('2026-08-10T00:00:00.000Z')))
      .resolves.toMatchObject({
        generated_at: '2026-08-10T00:00:00.000Z',
        counts: { active_resources: 12, resource_versions: 9, external_resources: 3, mfl_resources: 4 },
        anomalies: { resources_without_version: 2, resources_without_local_file_path: 5 },
        legacy_download_baseline: 1382,
      });
  });
});
```

- [ ] **Step 2: Run the audit-report test to verify it fails**

Run:

```bash
npm test -- --runInBand src/scripts/resource-migration-audit.report.spec.ts
```

Expected: FAIL because the report builder does not exist.

- [ ] **Step 3: Implement typed SELECT-only audit report construction**

Create `src/scripts/resource-migration-audit.report.ts` with this exact query helper and report shape:

```ts
export type Query = (sql: string, parameters?: unknown[]) => Promise<Array<Record<string, unknown>>>;

export type ResourceMigrationAuditReport = {
  generated_at: string;
  counts: Record<string, number>;
  anomalies: Record<string, number>;
  legacy_download_baseline: number;
};

async function scalarCount(query: Query, sql: string): Promise<number> {
  const rows = await query(sql);
  return Number(rows[0]?.count ?? 0);
}

export async function buildResourceMigrationAudit(
  query: Query,
  generatedAt: Date,
): Promise<ResourceMigrationAuditReport> {
  const [
    activeResources,
    resourceVersions,
    externalResources,
    mflResources,
    resourcesWithoutVersion,
    resourcesWithoutLocalFilePath,
    legacyDownloadBaseline,
  ] = await Promise.all([
    scalarCount(query, "SELECT COUNT(*) AS count FROM `resources` WHERE `deleted_at` IS NULL"),
    scalarCount(query, "SELECT COUNT(*) AS count FROM `resource_versions`"),
    scalarCount(query, "SELECT COUNT(*) AS count FROM `resources` WHERE `deleted_at` IS NULL AND `resource_type` = 'external'"),
    scalarCount(query, "SELECT COUNT(*) AS count FROM `resources` WHERE `deleted_at` IS NULL AND `use_mfl` = 1"),
    scalarCount(query, "SELECT COUNT(*) AS count FROM `resources` WHERE `deleted_at` IS NULL AND TRIM(COALESCE(`version`, '')) = ''"),
    scalarCount(query, "SELECT COUNT(*) AS count FROM `resources` WHERE `deleted_at` IS NULL AND `resource_type` = 'upload' AND `use_mfl` = 0 AND `file_path` IS NULL"),
    scalarCount(query, "SELECT COALESCE(SUM(`download_count`), 0) AS count FROM `resources` WHERE `deleted_at` IS NULL"),
  ]);

  return {
    generated_at: generatedAt.toISOString(),
    counts: {
      active_resources: activeResources,
      resource_versions: resourceVersions,
      external_resources: externalResources,
      mfl_resources: mflResources,
    },
    anomalies: {
      resources_without_version: resourcesWithoutVersion,
      resources_without_local_file_path: resourcesWithoutLocalFilePath,
    },
    legacy_download_baseline: legacyDownloadBaseline,
  };
}
```

Then extend the report with additional scalar SELECTs for the approved dirty-data matrix: pending resources, rejected resources, soft-deleted resources, disabled-category resources, Version rows with blank version, Version rows without local file path, and Resources whose `description` is blank. Each additional query must remain a literal `SELECT`.

- [ ] **Step 4: Implement the executable CLI and package script**

Create `src/scripts/resource-migration-audit.ts`:

```ts
import AppDataSource from '../database/data-source';
import { buildResourceMigrationAudit } from './resource-migration-audit.report';

async function main(): Promise<void> {
  await AppDataSource.initialize();
  try {
    const report = await buildResourceMigrationAudit(
      (sql, parameters) => AppDataSource.query(sql, parameters),
      new Date(),
    );
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

main().catch((error) => {
  console.error('Resource migration audit failed:', error);
  process.exitCode = 1;
});
```

Add this script to `package.json`:

```json
"audit:resources": "npm run build:backend && node dist/scripts/resource-migration-audit.js"
```

The script deliberately writes JSON only to stdout. Operators redirect it to a timestamped report file in their deployment workflow; the repository does not introduce a persistent audit-report store in this phase.

- [ ] **Step 5: Run unit tests and compile the CLI**

Run:

```bash
npm test -- --runInBand src/scripts/resource-migration-audit.report.spec.ts
npm run build:backend
```

Expected: the report test PASSes and `dist/scripts/resource-migration-audit.js` exists after build.

- [ ] **Step 6: Run the audit against a configured non-production or backed-up database**

Run:

```bash
npm run audit:resources > resource-migration-audit.json
```

Expected: exit code 0 and valid JSON containing `counts`, `anomalies`, and `legacy_download_baseline`. Do not run this against production until the operator has confirmed the target connection string and has a current backup.

- [ ] **Step 7: Review checkpoint**

Run:

```bash
git diff --check
git diff -- package.json src/scripts
```

Expected: every SQL query in the new audit source begins with `SELECT`; no migration, repository write, or resource service write call is present. Do not commit without explicit user authorization.

---

### Task 4: Verify the P0-A slice and document the handoff boundary

**Files:**
- Modify: `docs/superpowers/specs/2026-08-10-mdtbbs-overall-refactor-design-v2.md:714-840`
- Modify: `docs/superpowers/plans/2026-08-10-p0a-v1-contract-resource-audit.md`
- Test: `src/common/interceptors/response.interceptor.spec.ts`
- Test: `src/common/filters/all-exceptions.filter.spec.ts`
- Test: `src/modules/capabilities/capabilities.service.spec.ts`
- Test: `src/modules/capabilities/capabilities.controller.spec.ts`
- Test: `src/scripts/resource-migration-audit.report.spec.ts`

**Interfaces:**
- Consumes: completed Tasks 1–3.
- Produces: a verified P0-A boundary and an explicit input checklist for the next P0-B Resource Core plan.

- [ ] **Step 1: Add the P0-A completion evidence to the design spec**

In the design spec's P0-A section, append this exact completion record template after implementation evidence is available:

```markdown
### P0-A implementation evidence

- V1 JSON and raw-transport response behavior verified by Jest.
- V1 error envelope and Legacy error compatibility verified by Jest.
- `GET /api/v1/capabilities` documented in the V1 OpenAPI document.
- Coarse V1 flags are stored in existing Settings keys; no feature-flag table was added.
- `npm run audit:resources` produced a read-only JSON report against the approved audit target.
- No Resource aggregate migration, Backfill mutation, Device Auth, Outbox, or Download Delivery code was included in P0-A.
```

Do not append this evidence until all commands in Steps 2–4 pass.

- [ ] **Step 2: Run the focused P0-A test suite**

Run:

```bash
npm test -- --runInBand \
  src/common/middleware/request-id.middleware.spec.ts \
  src/common/interceptors/response.interceptor.spec.ts \
  src/common/filters/all-exceptions.filter.spec.ts \
  src/modules/capabilities/capabilities.service.spec.ts \
  src/modules/capabilities/capabilities.controller.spec.ts \
  src/scripts/resource-migration-audit.report.spec.ts
```

Expected: all focused P0-A tests PASS.

- [ ] **Step 3: Run the full non-E2E backend test suite and build**

Run:

```bash
npm test -- --runInBand
npm run build:backend
```

Expected: Jest passes using `jest.config.js`, which excludes `tests/e2e/`; backend build exits with code 0.

- [ ] **Step 4: Run static diff and migration-list safety checks**

Run:

```bash
git diff --check
git diff --name-only
```

Expected: no whitespace errors; the changed-file list does not contain `src/database/migrations/index.ts` or any new migration file.

- [ ] **Step 5: Validate the audit report before authorizing P0-B**

Inspect `resource-migration-audit.json` and record these values in the implementation review:

```text
active_resources
resource_versions
external_resources
mfl_resources
resources_without_version
resources_without_local_file_path
blank_version_rows
blank_description_rows
legacy_download_baseline
```

Block P0-B schema/backfill implementation if the report reveals duplicate version semantics, missing table access, or unclassified file states that the Resource Core migration cannot map deterministically.

- [ ] **Step 6: Review checkpoint**

Run:

```bash
git status --short
git diff --stat
```

Expected: only P0-A source, test, package, and documentation changes are present. Present the diff and audit summary for review. Do not commit without explicit user authorization.

---

## P0-B Handoff Inputs

The next plan, **P0-B Resource Core Schema and Compatibility**, may begin only after this plan has produced:

1. A reviewed read-only Legacy Resource audit report.
2. V1 JSON/error/raw transport primitives.
3. A Settings-backed coarse global V1 read flag.
4. A documented V1 capabilities endpoint.
5. A confirmed `MindustryVersionValue` grammar based on real Resource compatibility examples collected from the audit.

P0-B will add `public_id`, Resource aggregate fields, ResourceFile/Attribution/Dependency/Compatibility entities, additive migrations, dry-run backfill, Legacy projection, and Resource Detail V1 UI. It will not add Download Grant, Media, Device Auth, Outbox, Search, or Object Storage unless a separate approved plan explicitly expands the scope.
