import { NotFoundException } from '@nestjs/common';
import { ResourceOperationsService } from './resource-operations.service';

function resource(overrides: Record<string, unknown> = {}) {
  return {
    id: 9,
    public_id: 'resource-9',
    title: 'Fixture',
    status: 'approved',
    is_public: 1,
    visibility: 'public',
    is_featured: 0,
    resource_kind: 'schematic',
    file_size: 0,
    use_mfl: 0,
    rating_count: 0,
    rating_sum: 0,
    rating_average: 0,
    metadata_json: {},
    user: null,
    category: null,
    deleted_at: null,
    ...overrides,
  } as any;
}

function fixture(entity: any, logImpl?: jest.Mock) {
  const repository = {
    findOne: jest.fn().mockResolvedValue(entity),
    save: jest.fn(async (value) => value),
  };
  const manager = { getRepository: jest.fn().mockReturnValue(repository) };
  const dataSource = {
    transaction: jest.fn(async (callback: (transactionManager: typeof manager) => unknown) => callback(manager)),
  };
  const logs = { log: logImpl || jest.fn().mockResolvedValue(undefined) };
  const service = new ResourceOperationsService(repository as any, {} as any, {} as any, dataSource as any, logs as any);
  return { service, repository, manager, dataSource, logs };
}

describe('ResourceOperationsService', () => {
  it('updates featured state by public id and writes its correlated audit in the same transaction', async () => {
    const { service, repository, manager, dataSource, logs } = fixture(resource());

    const featured = await service.setFeatured('resource-9', true, {
      userId: 7,
      requestId: 'req_featured_123',
      ipAddress: '127.0.0.1',
      userAgent: 'Playwright fixture',
    });

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(repository.findOne).toHaveBeenCalledWith({
      where: { public_id: 'resource-9' },
      lock: { mode: 'pessimistic_write' },
    });
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ is_featured: 1 }));
    expect(logs.log).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 7,
      action: 'resource.featured.add',
      target_type: 'resource',
      target_id: 9,
      ip_address: '127.0.0.1',
      user_agent: 'Playwright fixture',
      details: JSON.stringify({ public_id: 'resource-9', featured: true, request_id: 'req_featured_123' }),
    }), manager);
    expect(featured).toMatchObject({ public_id: 'resource-9', is_featured: true, resource: { public_id: 'resource-9', is_featured: 1 } });
  });

  it('audits the legacy numeric-id moderation route inside the same transaction', async () => {
    const { service, repository, manager, logs } = fixture(resource());

    await service.setFeaturedById(9, false, { userId: 11, requestId: 'req_legacy_456' });

    expect(repository.findOne).toHaveBeenCalledWith({
      where: { id: 9 },
      lock: { mode: 'pessimistic_write' },
    });
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ is_featured: 0 }));
    expect(logs.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'resource.featured',
      target_id: 9,
      details: JSON.stringify({ public_id: 'resource-9', featured: false, request_id: 'req_legacy_456' }),
    }), manager);
  });

  it('does not mutate missing or soft-deleted resources', async () => {
    const missing = fixture(null);
    await expect(missing.service.setFeatured('missing', true, {})).rejects.toBeInstanceOf(NotFoundException);

    const deleted = fixture(resource({ deleted_at: new Date() }));
    await expect(deleted.service.setFeatured('resource-9', true, {})).rejects.toBeInstanceOf(NotFoundException);
    expect(missing.repository.save).not.toHaveBeenCalled();
    expect(deleted.repository.save).not.toHaveBeenCalled();
    expect(missing.logs.log).not.toHaveBeenCalled();
    expect(deleted.logs.log).not.toHaveBeenCalled();
  });

  it('fails the transaction when the audit insert fails after the resource update', async () => {
    const auditFailure = new Error('audit storage unavailable');
    const { service, repository, dataSource, logs } = fixture(resource(), jest.fn().mockRejectedValue(auditFailure));

    await expect(service.setFeatured('resource-9', true, { requestId: 'req_audit_failure' })).rejects.toBe(auditFailure);
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(logs.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'resource.featured.add' }), expect.any(Object));
  });
});
