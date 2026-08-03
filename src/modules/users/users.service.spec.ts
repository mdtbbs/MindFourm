const decorator = () => () => undefined;

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

jest.mock('typeorm', () => ({
  Repository: class Repository {},
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
  Like: (value: unknown) => ({ __op: 'Like', value }),
}));

import { UsersService } from './users.service';

function createChain(methods: Record<string, jest.Mock> = {}) {
  const chain: Record<string, jest.Mock> = {
    innerJoin: jest.fn().mockReturnThis(),
    innerJoinAndSelect: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue({ count: '0' }),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    ...methods,
  };
  return chain;
}

function createService(overrides: {
  userRepository?: Record<string, jest.Mock>;
  postRepository?: Record<string, jest.Mock>;
  replyRepository?: Record<string, jest.Mock>;
  settingsService?: Record<string, jest.Mock>;
  adminNotificationsService?: Record<string, jest.Mock>;
} = {}) {
  const userRepository = {
    findOne: jest.fn().mockResolvedValue({ id: 7, username: 'Alice' }),
    save: jest.fn(async (user) => user),
    find: jest.fn().mockResolvedValue([]),
    createQueryBuilder: jest.fn(() => createChain()),
    ...overrides.userRepository,
  };
  const postRepository = {
    createQueryBuilder: jest.fn(() => createChain()),
    ...overrides.postRepository,
  };
  const replyRepository = {
    createQueryBuilder: jest.fn(() => createChain()),
    ...overrides.replyRepository,
  };

  const service = new UsersService(
    userRepository as any,
    postRepository as any,
    replyRepository as any,
    { getBoolean: jest.fn(), ...overrides.settingsService } as any,
    { publishModerationPending: jest.fn(), ...overrides.adminNotificationsService } as any,
  );

  return { service, userRepository, postRepository, replyRepository };
}

describe('UsersService.getRepliesByUserId', () => {
  it('returns paginated public replies in the shape the profile page normalizes', async () => {
    const query = createChain({
      getManyAndCount: jest.fn().mockResolvedValue([
        [
          {
            id: 3,
            post_id: 9,
            user_id: 7,
            parent_reply_id: 2,
            content: 'nested reply',
            content_html: '<p>nested reply</p>',
            status: 'published',
            like_count: 4,
            created_at: new Date('2026-08-01T00:00:00Z'),
            updated_at: new Date('2026-08-01T00:01:00Z'),
            post: { id: 9, title: 'Target post' },
          },
        ],
        1,
      ]),
    });
    const { service, replyRepository } = createService({
      replyRepository: { createQueryBuilder: jest.fn(() => query) },
    });

    const result = await service.getRepliesByUserId(7, 2, 20);

    expect(replyRepository.createQueryBuilder).toHaveBeenCalledWith('reply');
    expect(query.innerJoinAndSelect).toHaveBeenCalledWith('reply.post', 'post');
    expect(query.andWhere).toHaveBeenCalledWith('reply.status = :replyStatus', { replyStatus: 'published' });
    expect(query.andWhere).toHaveBeenCalledWith('post.status = :postStatus', { postStatus: 'published' });
    expect(query.skip).toHaveBeenCalledWith(20);
    expect(query.take).toHaveBeenCalledWith(20);
    expect(result).toEqual({
      data: [
        expect.objectContaining({
          id: 3,
          post_id: 9,
          parent_reply_id: 2,
          content: 'nested reply',
          post_title: 'Target post',
        }),
      ],
      pagination: { page: 2, limit: 20, total: 1, totalPages: 1 },
    });
  });

  it('keeps empty reply pages normalizable by reporting one total page', async () => {
    const query = createChain({ getManyAndCount: jest.fn().mockResolvedValue([[], 0]) });
    const { service } = createService({
      replyRepository: { createQueryBuilder: jest.fn(() => query) },
    });

    const result = await service.getRepliesByUserId(7);

    expect(result).toEqual({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
    });
  });
});
