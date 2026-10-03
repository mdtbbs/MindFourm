import { LikesService } from './likes.service';

describe('LikesService resource discussion visibility', () => {
  it('does not return a liked resource discussion after its resource becomes private', async () => {
    const query = {
      innerJoin: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    const postRepo = { createQueryBuilder: jest.fn().mockReturnValue(query) };
    const service = new LikesService({} as any, {} as any, postRepo as any, {} as any, {} as any, {} as any, {} as any);

    await service.getUserLikedPosts(7, 1, 20);

    expect(query.andWhere).toHaveBeenCalledWith(
      expect.stringContaining("COALESCE(p.post_type, 'normal') <> 'resource_discussion'"),
      { postVisibilityUser: 7 },
    );
  });
});
