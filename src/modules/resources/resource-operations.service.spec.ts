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

describe('ResourceOperationsService', () => {
  it('updates featured state by public id and returns the public resource projection', async () => {
    const entity = resource();
    const repository = {
      findOne: jest.fn().mockResolvedValue(entity),
      save: jest.fn(async (value) => value),
    };
    const service = new ResourceOperationsService(repository as any, {} as any, {} as any);

    const featured = await service.setFeatured('resource-9', true);
    expect(repository.findOne).toHaveBeenCalledWith({ where: { public_id: 'resource-9' } });
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ is_featured: 1 }));
    expect(featured).toMatchObject({ public_id: 'resource-9', is_featured: true, resource: { public_id: 'resource-9', is_featured: 1 } });

    const unfeatured = await service.setFeatured('resource-9', false);
    expect(repository.save).toHaveBeenLastCalledWith(expect.objectContaining({ is_featured: 0 }));
    expect(unfeatured.is_featured).toBe(false);
  });

  it('does not mutate missing or soft-deleted resources', async () => {
    const save = jest.fn();
    const missing = new ResourceOperationsService({ findOne: jest.fn().mockResolvedValue(null), save } as any, {} as any, {} as any);
    await expect(missing.setFeatured('missing', true)).rejects.toBeInstanceOf(NotFoundException);

    const deleted = new ResourceOperationsService({
      findOne: jest.fn().mockResolvedValue(resource({ deleted_at: new Date() })),
      save,
    } as any, {} as any, {} as any);
    await expect(deleted.setFeatured('resource-9', true)).rejects.toBeInstanceOf(NotFoundException);
    expect(save).not.toHaveBeenCalled();
  });
});
