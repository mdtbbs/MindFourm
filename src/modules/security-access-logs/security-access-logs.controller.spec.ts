import 'reflect-metadata';
import { ROLES_KEY } from '@common/decorators/roles.decorator';
import { RolesGuard } from '@common/guards/roles.guard';
import { SecurityAccessLogsController } from './security-access-logs.controller';

describe('SecurityAccessLogsController access policy', () => {
  it('is restricted to administrators and omitted from public OpenAPI', () => {
    expect(Reflect.getMetadata(ROLES_KEY, SecurityAccessLogsController)).toEqual(['admin']);
    expect(Reflect.getMetadata('swagger/apiExcludeController', SecurityAccessLogsController)).toEqual([true]);
  });

  it('rejects moderators before they can read raw IP addresses', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(['admin']) };
    const guard = new RolesGuard(reflector as any);
    const context: any = {
      getHandler: () => SecurityAccessLogsController.prototype.get,
      getClass: () => SecurityAccessLogsController,
      switchToHttp: () => ({ getRequest: () => ({ user: { id: 3, role: 'moderator' } }) }),
    };
    expect(() => guard.canActivate(context)).toThrow('权限不足');
  });
});
