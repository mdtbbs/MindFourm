import { ResourcesService } from './resources.service';

function createService(overrides: {
  resourceRepository?: Record<string, jest.Mock>;
  manager?: Record<string, jest.Mock>;
  dataSource?: Record<string, jest.Mock>;
  adminNotificationsService?: Record<string, jest.Mock>;
} = {}) {
  const resourceRepository = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    update: jest.fn().mockResolvedValue(undefined),
    count: jest.fn().mockResolvedValue(0),
    ...overrides.resourceRepository,
  };
  const manager = {
    create: jest.fn().mockImplementation((_entity: unknown, value: unknown) => value),
    save: jest.fn().mockImplementation(async (value: unknown) => ({
      id: 81,
      ...(value as Record<string, unknown>),
    })),
    findOne: jest.fn(),
    update: jest.fn().mockResolvedValue(undefined),
    ...overrides.manager,
  };
  const dataSource = {
    transaction: jest.fn().mockImplementation(async (callback: (txnManager: typeof manager) => unknown) =>
      callback(manager)),
    ...overrides.dataSource,
  };
  const adminNotificationsService = {
    publishModerationPending: jest.fn().mockResolvedValue([]),
    publishModerationResult: jest.fn().mockResolvedValue([]),
    ...overrides.adminNotificationsService,
  };

  const service = new ResourcesService(
    resourceRepository as any,
    {} as any,
    {} as any,
    {} as any,
    dataSource as any,
    adminNotificationsService as any,
  );

  return {
    service,
    resourceRepository,
    manager,
    dataSource,
    adminNotificationsService,
  };
}

describe('ResourcesService', () => {
  it('uses public resource statuses for the public list regardless of requested status', async () => {
    const { service, resourceRepository } = createService();

    await service.getList({ status: 'pending', limit: 20 }, { scope: 'public' });

    const where = resourceRepository.find.mock.calls[0][0].where;
    expect(where.is_public).toBe(1);
    expect(where.status).toMatchObject({
      _type: 'in',
      _value: ['approved', 'published'],
    });
  });

  it('does not force a default status filter for the admin list', async () => {
    const { service, resourceRepository } = createService();

    await service.getList({ limit: 20 }, { scope: 'admin' });

    const where = resourceRepository.find.mock.calls[0][0].where;
    expect(where).not.toHaveProperty('status');
    expect(where).not.toHaveProperty('is_public');
  });

  it('keeps the requested status filter for the admin list', async () => {
    const { service, resourceRepository } = createService();

    await service.getList({ status: 'pending', limit: 20 }, { scope: 'admin' });

    const where = resourceRepository.find.mock.calls[0][0].where;
    expect(where.status).toBe('pending');
  });

  it('publishes a moderation pending notification when a resource is created for review', async () => {
    const { service, adminNotificationsService, manager } = createService({
      manager: {
        findOne: jest.fn().mockResolvedValue({
          id: 81,
          title: 'Useful Pack',
          description: 'A reviewed upload',
          resource_type: 'upload',
          status: 'pending',
          is_public: 1,
          file_size: 128,
          created_at: new Date('2026-07-08T10:00:00.000Z'),
          updated_at: new Date('2026-07-08T10:00:00.000Z'),
          user: { username: 'alice' },
          category: null,
        }),
      },
    });

    await service.create(
      {
        title: 'Useful Pack',
        description: 'A reviewed upload',
        resource_type: 'upload',
      } as any,
      5,
      {
        file_name: 'pack.zip',
        file_path: './uploads/resources/pack.zip',
        file_size: 128,
        mime_type: 'application/zip',
      },
    );

    expect(manager.save).toHaveBeenCalledTimes(1);
    expect(adminNotificationsService.publishModerationPending).toHaveBeenCalledWith({
      item_type: 'resource',
      item_id: 81,
      title: 'Useful Pack',
      content: 'A reviewed upload',
      author_username: 'alice',
      action_url: '/admin/resources/moderation',
    });
  });

  it('publishes a moderation result notification when resource status changes', async () => {
    const { service, resourceRepository, adminNotificationsService } = createService({
      resourceRepository: {
        findOne: jest.fn()
          .mockResolvedValueOnce({
            id: 22,
            title: 'Useful Pack',
            status: 'pending',
            is_public: 1,
            file_size: 128,
            created_at: new Date('2026-07-08T10:00:00.000Z'),
            updated_at: new Date('2026-07-08T10:00:00.000Z'),
            user: { username: 'alice' },
            category: null,
          })
          .mockResolvedValueOnce({
            id: 22,
            title: 'Useful Pack',
            status: 'approved',
            is_public: 1,
            file_size: 128,
            created_at: new Date('2026-07-08T10:00:00.000Z'),
            updated_at: new Date('2026-07-08T10:05:00.000Z'),
            user: { username: 'alice' },
            category: null,
          }),
      },
    });

    await service.updateStatus(22, 'approved', { actorUsername: 'moderatorA' });

    expect(resourceRepository.update).toHaveBeenCalledWith(22, { status: 'approved' });
    expect(adminNotificationsService.publishModerationResult).toHaveBeenCalledWith({
      item_type: 'resource',
      item_id: 22,
      action: 'approved',
      actor_username: 'moderatorA',
      subject: 'Useful Pack',
      action_url: '/admin/resources?status=approved',
    });
  });
});
