import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ForumApiKeyGuard } from './forum-api-key.guard';

function createContext(headers: Record<string, string> = {}) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as any;
}

describe('ForumApiKeyGuard', () => {
  function createGuard(apiKey = 'secret-key') {
    const config = {
      get: jest.fn().mockReturnValue(apiKey),
    } as unknown as jest.Mocked<ConfigService>;

    return new ForumApiKeyGuard(config);
  }

  it('rejects requests when service api key is not configured', () => {
    const guard = createGuard('');

    expect(() => guard.canActivate(createContext({ 'x-api-key': 'secret-key' })))
      .toThrow(ForbiddenException);
  });

  it('rejects requests with an invalid api key', () => {
    const guard = createGuard();

    expect(() => guard.canActivate(createContext({ 'x-api-key': 'wrong-key' })))
      .toThrow(ForbiddenException);
  });

  it('accepts x-api-key requests with the configured api key', () => {
    const guard = createGuard();

    expect(guard.canActivate(createContext({ 'x-api-key': 'secret-key' }))).toBe(true);
  });

  it('accepts bearer token requests with the configured api key', () => {
    const guard = createGuard();

    expect(guard.canActivate(createContext({ authorization: 'Bearer secret-key' }))).toBe(true);
  });
});
