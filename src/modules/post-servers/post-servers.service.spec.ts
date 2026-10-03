import { PostServersService } from './post-servers.service';

describe('PostServersService public thread visibility', () => {
  it('filters server-linked posts through shared public visibility, including resource discussions', async () => {
    const query = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    const postRepo = { createQueryBuilder: jest.fn().mockReturnValue(query) };
    const relationRepo = { find: jest.fn().mockResolvedValue([{ source_id: '81' }]) };
    const service = new PostServersService(postRepo as any, {} as any, relationRepo as any);

    await service.getPostsByServer(9);

    expect(query.where).toHaveBeenCalledWith('post.id IN (:...postIds)', { postIds: ['81'] });
    expect(query.andWhere).toHaveBeenCalledWith('post.status = :postVisibilityStatus', { postVisibilityStatus: 'published' });
    expect(query.andWhere).toHaveBeenCalledWith('post.required_group_id IS NULL', undefined);
    expect(query.andWhere.mock.calls.some(([where]) => String(where).includes('post_visibility_resource'))).toBe(true);
  });
});
