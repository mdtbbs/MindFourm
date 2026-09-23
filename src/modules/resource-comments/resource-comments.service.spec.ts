import { ResourceCommentsService } from './resource-comments.service';

describe('ResourceCommentsService', () => {
  it('uses the public visible-only count and keeps pagination total', async () => {
    const comments = [{ id: 1, resource_id: 8, parent_id: null, status: 'visible' }];
    const commentRepo = { findAndCount: jest.fn().mockResolvedValue([comments, 1]) };
    const service = new ResourceCommentsService(commentRepo as any);

    const result = await service.findByResource(8, 1, 100);

    expect(commentRepo.findAndCount).toHaveBeenCalledWith(expect.objectContaining({
      where: { resource_id: 8, status: 'visible' },
      skip: 0,
      take: 100,
    }));
    expect(result.pagination.total).toBe(1);
    expect(result.data).toBe(comments);
  });
});
