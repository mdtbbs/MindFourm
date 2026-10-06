import { ResourceOperationsController } from './resource-operations.controller';
import { ROLES_KEY } from '@common/decorators/roles.decorator';

describe('ResourceOperationsController', () => {
  it('requires admin role for featured mutations', () => {
    expect(Reflect.getMetadata(ROLES_KEY, ResourceOperationsController.prototype.setFeatured)).toEqual(['admin']);
  });

  function fixture(featured: boolean) {
    const operations = {
      setFeatured: jest.fn().mockResolvedValue({
        public_id: 'fixture-resource',
        is_featured: featured,
        resource: { id: 91, public_id: 'fixture-resource' },
      }),
      summary: jest.fn(),
    };
    const controller = new ResourceOperationsController(operations as any);
    const request = {
      user: { id: 7 },
      requestId: 'req_featured_123',
      headers: { 'user-agent': 'Playwright fixture' },
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
    };
    return { controller, operations, request };
  }

  it.each([true, false])('forwards featured=%s with request correlation', async (featured) => {
    const { controller, operations, request } = fixture(featured);

    await expect(controller.setFeatured('fixture-resource', { featured }, request)).resolves.toMatchObject({
      public_id: 'fixture-resource',
      is_featured: featured,
    });

    expect(operations.setFeatured).toHaveBeenCalledWith('fixture-resource', featured, {
      userId: 7,
      requestId: 'req_featured_123',
      ipAddress: expect.any(String),
      userAgent: 'Playwright fixture',
    });
    expect(operations.setFeatured.mock.calls[0][2].ipAddress).toBeTruthy();
  });
});
