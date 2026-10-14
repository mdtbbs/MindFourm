import { ForbiddenException, HttpException } from '@nestjs/common';
import { ExternalLanLinkQuickCodeController } from './lanlink-quick-code.controller';
import { EXTERNAL_SCOPE_KEY } from '@common/decorators/external-scope.decorator';
import {
  EXTERNAL_LEGACY_FLAG_KEY,
  EXTERNAL_STRICT_SCOPE_KEY,
} from '@common/decorators/external-route-policy.decorator';

/**
 * The external quick-code routes are compatibility surface for the legacy
 * LanLink control plane. These suites pin:
 *
 * - response minimisation: no `email` and no `phone_verified_at` reach the
 *   caller, because the LanLink token payload never reads them;
 * - the failed-attempt budget (fail closed when its counter is unavailable);
 * - the decorator wiring the guard relies on.
 */

const legacyUser = {
  id: 42,
  mindauth_id: 1001,
  username: 'player',
  email: 'player@example.invalid',
  avatar_url: 'https://example.invalid/avatar.png',
  role: 'user',
  phone_verified: true,
  phone_verified_at: new Date('2026-07-29T00:00:00Z'),
};

function createController(options: {
  valid?: boolean;
  user?: any;
  counter?: number;
  strictCounter?: () => Promise<number>;
  redisGet?: () => Promise<string | null>;
} = {}) {
  const quickCodeService = {
    validate: jest.fn().mockResolvedValue(
      options.valid === false
        ? { valid: false }
        : {
          valid: true,
          user: options.user ?? legacyUser,
          code: { token_version: 3, last_used_at: new Date(), use_count: 5 },
        },
    ),
    getUserStatus: jest.fn().mockResolvedValue(options.user === null ? null : (options.user ?? legacyUser)),
  } as any;

  const redis = {
    get: jest.fn(options.redisGet ?? (async () => (options.counter ? String(options.counter) : null))),
    incrementFixedWindowStrict: jest.fn(options.strictCounter ?? (async () => 1)),
  } as any;

  const controller = new ExternalLanLinkQuickCodeController(quickCodeService, redis);
  const request = {
    externalApiKey: { id: 7, scopes: ['lanlink:legacy_quick_code'] },
    clientIp: '203.0.113.10',
    ip: '203.0.113.10',
  };
  return { controller, quickCodeService, redis, request };
}

describe('ExternalLanLinkQuickCodeController response minimisation', () => {
  it('returns only the identity fields the legacy LanLink control plane consumes', async () => {
    const { controller, request } = createController();
    const result = await controller.validate({ code: 'LL-ABCD-EFGH' }, request);

    expect(result).toEqual({
      valid: true,
      user: {
        id: 42,
        mindauth_id: 1001,
        username: 'player',
        avatar_url: 'https://example.invalid/avatar.png',
        role: 'user',
        phone_verified: true,
      },
      code: { token_version: 3 },
    });
  });

  it('keeps PII and usage metadata out of the wire payload', async () => {
    const { controller, request } = createController();
    const result = await controller.validate({ code: 'LL-ABCD-EFGH' }, request);

    expect(JSON.stringify(result)).not.toContain('player@example.invalid');
    expect(JSON.stringify(result)).not.toContain('phone_verified_at');
    expect(JSON.stringify(result)).not.toContain('last_used_at');
    expect(JSON.stringify(result)).not.toContain('use_count');
  });

  it('minimises the user-status projection the same way', async () => {
    const { controller } = createController();
    const result = await controller.userStatus(42);

    expect(JSON.stringify(result)).not.toContain('player@example.invalid');
    expect(JSON.stringify(result)).not.toContain('phone_verified_at');
    expect(result.user).toMatchObject({ id: 42, username: 'player' });
  });

  it('reports an invalid code without leaking whether a user exists', async () => {
    const { controller, request } = createController({ valid: false });
    await expect(controller.validate({ code: 'LL-XXXX-XXXX' }, request)).resolves.toEqual({ valid: false });
  });
});

describe('ExternalLanLinkQuickCodeController failed-attempt budget', () => {
  it('refuses further submissions once the failure budget is exhausted', async () => {
    const { controller, request } = createController({ counter: 20 });
    try {
      await controller.validate({ code: 'LL-ABCD-EFGH' }, request);
      throw new Error('expected rejection');
    } catch (error: any) {
      expect(error).toBeInstanceOf(HttpException);
      expect(error.response.code).toBe('LANLINK_QUICK_CODE_ATTEMPTS_EXCEEDED');
      expect(error.getStatus()).toBe(429);
    }
  });

  it('charges the budget on a failed submission only', async () => {
    const { controller, request, redis, quickCodeService } = createController({ valid: false });
    await controller.validate({ code: 'LL-ABCD-EFGH' }, request);

    expect(redis.incrementFixedWindowStrict).toHaveBeenCalledTimes(1);
    expect(quickCodeService.validate).toHaveBeenCalled();
  });

  it('does not charge the budget on a successful submission', async () => {
    const { controller, request, redis } = createController();
    await controller.validate({ code: 'LL-ABCD-EFGH' }, request);
    expect(redis.incrementFixedWindowStrict).not.toHaveBeenCalled();
  });

  it('fails closed when the failure counter is unavailable', async () => {
    const { controller, request } = createController({
      valid: false,
      strictCounter: async () => { throw new Error('redis down'); },
    });
    try {
      await controller.validate({ code: 'LL-ABCD-EFGH' }, request);
      throw new Error('expected rejection');
    } catch (error: any) {
      expect(error).toBeInstanceOf(HttpException);
      expect(error.response.code).toBe('SECURITY_DEPENDENCY_UNAVAILABLE');
      expect(error.getStatus()).toBe(503);
    }
  });
});

describe('ExternalLanLinkQuickCodeController route policy wiring', () => {
  it.each([
    ['validate', ExternalLanLinkQuickCodeController.prototype.validate],
    ['userStatus', ExternalLanLinkQuickCodeController.prototype.userStatus],
  ])('declares the dedicated scope, strict deny-override and legacy flag on %s', (_name, handler) => {
    expect(Reflect.getMetadata(EXTERNAL_SCOPE_KEY, handler as object)).toEqual(['lanlink:legacy_quick_code']);
    expect(Reflect.getMetadata(EXTERNAL_STRICT_SCOPE_KEY, handler as object)).toEqual(['lanlink:legacy_quick_code']);
    expect(Reflect.getMetadata(EXTERNAL_LEGACY_FLAG_KEY, handler as object)).toMatchObject({
      configPath: 'lanlink.legacyQuickCodeEnabled',
      code: 'LANLINK_LEGACY_QUICK_CODE_DISABLED',
    });
  });
});
