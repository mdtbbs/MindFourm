const decorator = () => () => undefined;

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

jest.mock('typeorm', () => ({
  Repository: class Repository {},
  DataSource: class DataSource {},
  In: jest.fn((value) => ({ _type: 'in', _value: value })),
  IsNull: jest.fn(() => ({ _type: 'isNull' })),
  Not: jest.fn((value) => ({ _type: 'not', _value: value })),
  Entity: decorator,
  PrimaryGeneratedColumn: decorator,
  PrimaryColumn: decorator,
  Column: decorator,
  ManyToOne: decorator,
  OneToMany: decorator,
  ManyToMany: decorator,
  OneToOne: decorator,
  JoinColumn: decorator,
  JoinTable: decorator,
  CreateDateColumn: decorator,
  UpdateDateColumn: decorator,
  DeleteDateColumn: decorator,
  Index: decorator,
  Unique: decorator,
}));

jest.mock('@entities/resource.entity', () => ({ Resource: class Resource {} }));
jest.mock('@entities/resource-category.entity', () => ({ ResourceCategory: class ResourceCategory {} }));
jest.mock('@entities/resource-version.entity', () => ({ ResourceVersion: class ResourceVersion {} }));
jest.mock('@entities/user.entity', () => ({ User: class User {} }));

import { ResourcesService } from './resources.service';

function createService(overrides: {
  resourceRepository?: Record<string, jest.Mock>;
  manager?: Record<string, jest.Mock>;
  dataSource?: Record<string, jest.Mock>;
  adminNotificationsService?: Record<string, jest.Mock>;
  mflClientService?: Record<string, jest.Mock>;
} = {}) {
  const defaultQb = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  };

  const resourceRepository = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    update: jest.fn().mockResolvedValue(undefined),
    count: jest.fn().mockResolvedValue(0),
    // Creation no longer goes through a transaction manager: the MindFileList upload
    // has to happen outside the transaction, so the row is persisted via the
    // repository directly.
    create: jest.fn().mockImplementation((value: unknown) => value),
    save: jest.fn().mockImplementation(async (value: unknown) => ({
      id: 81,
      ...(value as Record<string, unknown>),
    })),
    delete: jest.fn().mockResolvedValue(undefined),
    increment: jest.fn().mockResolvedValue(undefined),
    createQueryBuilder: jest.fn(() => defaultQb),
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
  const mflClientService = {
    uploadFile: jest.fn(),
    getDownloadUrl: jest.fn(),
    syncApprovalStatus: jest.fn(),
    deleteFile: jest.fn(),
    ...overrides.mflClientService,
  };

  const notificationsService = {
    create: jest.fn().mockResolvedValue(undefined),
  };

  const service = new ResourcesService(
    resourceRepository as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    dataSource as any,
    adminNotificationsService as any,
    notificationsService as any,
    mflClientService as any,
  );

  return {
    service,
    resourceRepository,
    manager,
    dataSource,
    adminNotificationsService,
    mflClientService,
    defaultQb,
  };
}

describe('ResourcesService', () => {
  it('uses public resource statuses for the public list and filters disabled categories', async () => {
    const { service, resourceRepository, defaultQb } = createService();

    await service.getList({ status: 'pending', limit: 20 }, { scope: 'public' });

    // Public scope now uses createQueryBuilder (not find) to LEFT JOIN category
    expect(resourceRepository.createQueryBuilder).toHaveBeenCalledWith('resource');
    expect(defaultQb.leftJoin).toHaveBeenCalledWith('resource.category', 'category');
    expect(defaultQb.where).toHaveBeenCalledWith(
      'resource.status IN (:...statuses)',
      { statuses: ['approved', 'published'] },
    );
    expect(defaultQb.andWhere).toHaveBeenCalledWith(
      'resource.is_public = :isPublic',
      { isPublic: 1 },
    );
    // The category-active filter ensures disabled categories are excluded
    expect(defaultQb.andWhere).toHaveBeenCalledWith(
      '(category.id IS NULL OR category.is_active = :categoryActive)',
      { categoryActive: 1 },
    );
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
    // Creation persists via the repository rather than a transaction manager, so the
    // post-save re-read is mocked there.
    const { service, adminNotificationsService, resourceRepository } = createService({
      resourceRepository: {
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

    expect(resourceRepository.save).toHaveBeenCalledTimes(1);
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

    expect(resourceRepository.update).toHaveBeenCalledWith(22, {
      status: 'approved',
      reject_reason: null,
    });
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
