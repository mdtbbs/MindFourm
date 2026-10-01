import { UnauthorizedException } from '@nestjs/common';
import { RelayInternalAuthGuard } from './relay-internal-auth.guard';

describe('RelayInternalAuthGuard', () => {
  const credential = 'relay-machine-credential-with-at-least-32-bytes';
  const guard = new RelayInternalAuthGuard({ get: () => credential } as any);
  const contextFor = (supplied: string) => ({
    switchToHttp: () => ({ getRequest: () => ({ headers: { 'x-relay-machine-credential': supplied } }) }),
  }) as any;

  it('accepts the configured machine credential without requiring a client certificate', () => {
    expect(guard.canActivate(contextFor(credential))).toBe(true);
  });

  it.each(['', 'wrong-credential'])('rejects a missing or incorrect machine credential', (supplied) => {
    expect(() => guard.canActivate(contextFor(supplied))).toThrow(UnauthorizedException);
  });
});
