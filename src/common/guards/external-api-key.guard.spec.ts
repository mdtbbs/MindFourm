import { Reflector } from '@nestjs/core';
import { ExternalApiKeyGuard } from './external-api-key.guard';
import { EXTERNAL_SCOPE_KEY } from '../decorators/external-scope.decorator';
import {
  EXTERNAL_LEGACY_FLAG_KEY,
  EXTERNAL_STRICT_SCOPE_KEY,
} from '../decorators/external-route-policy.decorator';

/**
 * The External API key guard now carries three route-level policies:
 *
 * 1. `@ExternalScope` still matches wildcard grants for ordinary integrations.
 * 2. `@ExternalStrictScope` is a deny override for identity/credential routes:
 *    wildcard grants are refused even though the general matcher passes.
 * 3. `@ExternalLegacyFlag` refuses compatibility routes before scope evaluation.
 *
 * It also owns the fail-closed rate limiter for the strict routes. These suites
 * pin all three, plus the fact that non-strict routes keep their old
 * degrade-on-Redis-outage behaviour.
 */

const KEY = { id: 7, scopes: ['lanlink:auth'] };

function createGuard(options: {
  scopes?: string[];
  strictScopes?: string[] | null;
  requiredScopes?: string[];
  legacyFlag?: { configPath: string; code: string; message: string } | null;
  flagEnabled?: boolean;
  keyId?: number;
  redisImpl?: (key: string, window: number) => Promise<number>;
  legacyIncrImpl?: () => Promise<number>;
} = {}) {
  const apiKey = {
    id: options.keyId ?? KEY.id,
    name: 'test',
    key_prefix: 'mfk_test',
    scopes: options.scopes ?? KEY.scopes,
    allowed_ips: [],
    default_user_id: null,
    rate_limit_per_minute: 60,
  };

  const externalApiKeyService = {
    authenticate: jest.fn().mockResolvedValue({ id: apiKey.id, enabled: true, expires_at: null, scopes_json: JSON.stringify(apiKey.scopes), allowed_ips_json: null, rate_limit_per_minute: 60 }),
    toContext: jest.fn().mockReturnValue(apiKey),
    touchLastUsed: jest.fn().mockResolvedValue(undefined),
  } as any;

  const redis = {
    incrementFixedWindowStrict: jest.fn(options.redisImpl ?? (async () => 1)),
    incr: jest.fn(options.legacyIncrImpl ?? (async () => 1)),
    expire: jest.fn(async () => 1),
  } as any;

  const metadata: Record<string, unknown> = {
    [EXTERNAL_SCOPE_KEY]: options.requiredScopes ?? ['lanlink:auth'],
  };
  if (options.strictScopes !== null) {
    metadata[EXTERNAL_STRICT_SCOPE_KEY] = options.strictScopes ?? ['lanlink:auth'];
  }
  if (options.legacyFlag) metadata[EXTERNAL_LEGACY_FLAG_KEY] = options.legacyFlag;

  const reflector = {
    getAllAndOverride: jest.fn((key: string) => metadata[key]),
  } as unknown as Reflector;

  const config = {
    get: jest.fn((key: string) => {
      if (key === 'automation.apiKey') return undefined;
      if (options.legacyFlag && key === options.legacyFlag.configPath) return options.flagEnabled === true;
      return undefined;
    }),
  } as any;

  const guard = new ExternalApiKeyGuard(externalApiKeyService, redis, reflector, config);

  const request: any = {
    headers: { authorization: 'Bearer mfk_test_plain.secret' },
    clientIp: '203.0.113.10',
    ip: '203.0.113.10',
  };
  const response = { setHeader: jest.fn() };
  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as any;

  return { guard, context, request, apiKey, redis, externalApiKeyService };
}

async function expectRejection(promise: Promise<unknown>, code: string, status?: number) {
  try {
    await promise;
    throw new Error(`expected rejection with ${code}`);
  } catch (error: any) {
    expect(error?.response?.code ?? error?.code).toBe(code);
    if (status !== undefined) expect(error?.status ?? error?.getStatus?.()).toBe(status);
  }
}

describe('ExternalApiKeyGuard strict scope deny override', () => {
  it('accepts a key holding the exact dedicated scope', async () => {
    const { guard, context } = createGuard({ scopes: ['lanlink:auth'] });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it.each([
    [['*'], 'full wildcard'],
    [['admin:*'], 'admin wildcard'],
    [['lanlink:*'], 'domain wildcard'],
    [['*', 'lanlink:auth'], 'full wildcard alongside the exact scope'],
    [['admin:*', 'lanlink:auth'], 'admin wildcard alongside the exact scope'],
    [['friends:read'], 'missing scope'],
  ])('refuses %j (%s) even when the general matcher would pass', async (scopes) => {
    const { guard, context } = createGuard({ scopes: scopes as string[] });
    await expectRejection(guard.canActivate(context), 'EXTERNAL_API_SCOPE_DENIED', 403);
  });

  it('keeps accepting wildcard grants on ordinary routes that do not opt into strict scopes', async () => {
    const { guard, context } = createGuard({
      scopes: ['*'],
      requiredScopes: ['posts:read'],
      strictScopes: null,
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});

describe('ExternalApiKeyGuard legacy compatibility flag', () => {
  const flag = {
    configPath: 'lanlink.legacyQuickCodeEnabled',
    code: 'LANLINK_LEGACY_QUICK_CODE_DISABLED',
    message: 'disabled',
  };

  it('refuses the route while the flag is off, before evaluating scopes', async () => {
    const { guard, context, externalApiKeyService } = createGuard({
      scopes: ['lanlink:legacy_quick_code'],
      strictScopes: ['lanlink:legacy_quick_code'],
      requiredScopes: ['lanlink:legacy_quick_code'],
      legacyFlag: flag,
      flagEnabled: false,
    });
    await expectRejection(guard.canActivate(context), 'LANLINK_LEGACY_QUICK_CODE_DISABLED', 403);
  });

  it('still requires the dedicated scope once the flag is on', async () => {
    const { guard, context } = createGuard({
      scopes: ['*'],
      strictScopes: ['lanlink:legacy_quick_code'],
      requiredScopes: ['lanlink:legacy_quick_code'],
      legacyFlag: flag,
      flagEnabled: true,
    });
    await expectRejection(guard.canActivate(context), 'EXTERNAL_API_SCOPE_DENIED', 403);
  });

  it('allows the dedicated key through when the flag is on', async () => {
    const { guard, context } = createGuard({
      scopes: ['lanlink:legacy_quick_code'],
      strictScopes: ['lanlink:legacy_quick_code'],
      requiredScopes: ['lanlink:legacy_quick_code'],
      legacyFlag: flag,
      flagEnabled: true,
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});

describe('ExternalApiKeyGuard fail-closed rate limiting', () => {
  it('answers 503 SECURITY_DEPENDENCY_UNAVAILABLE when the strict counter throws', async () => {
    const { guard, context } = createGuard({
      redisImpl: async () => { throw new Error('redis down'); },
    });
    await expectRejection(guard.canActivate(context), 'SECURITY_DEPENDENCY_UNAVAILABLE', 503);
  });

  it('still enforces the key limit through the strict counter', async () => {
    const { guard, context } = createGuard({ redisImpl: async () => 61 });
    await expectRejection(guard.canActivate(context), 'EXTERNAL_API_RATE_LIMITED', 429);
  });

  it('leaves ordinary routes failing open when Redis is unavailable', async () => {
    const { guard, context } = createGuard({
      scopes: ['posts:read'],
      requiredScopes: ['posts:read'],
      strictScopes: null,
      legacyIncrImpl: async () => { throw new Error('redis down'); },
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
