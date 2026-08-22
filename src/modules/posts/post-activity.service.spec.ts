const decorator = () => () => undefined;

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

jest.mock('typeorm', () => ({
  Repository: class Repository {},
  IsNull: jest.fn(() => ({ _type: 'isNull' })),
}));

jest.mock('@entities/post.entity', () => ({ Post: class Post {} }));
jest.mock('@entities/reply.entity', () => ({ Reply: class Reply {} }));
jest.mock('@common/utils/constants', () => ({ REPLY_STATUS: { published: 'published' } }));

import { PostActivityService } from './post-activity.service';

function createService(overrides: {
  postRepository?: Record<string, jest.Mock>;
  replyRepository?: Record<string, jest.Mock>;
} = {}) {
  const postRepository = {
    findOne: jest.fn().mockResolvedValue({ id: 88, created_at: new Date('2026-08-01T10:00:00.000Z') }),
    update: jest.fn().mockResolvedValue(undefined),
    ...overrides.postRepository,
  };
  const replyRepository = {
    findOne: jest.fn().mockResolvedValue({ id: 9, created_at: new Date('2026-08-02T10:00:00.000Z') }),
    ...overrides.replyRepository,
  };

  return {
    service: new PostActivityService(postRepository as any, replyRepository as any),
    postRepository,
    replyRepository,
  };
}

describe('PostActivityService', () => {
  it('uses the latest visible reply when recalculating topic activity', async () => {
    const { service, postRepository, replyRepository } = createService();

    await service.recalculatePostActivity(88);

    expect(replyRepository.findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ post_id: 88, status: 'published' }),
      order: { created_at: 'DESC' },
    }));
    expect(postRepository.update).toHaveBeenCalledWith(88, {
      last_activity_at: new Date('2026-08-02T10:00:00.000Z'),
    });
  });

  it('falls back to post creation when no visible replies remain', async () => {
    const { service, postRepository } = createService({
      replyRepository: { findOne: jest.fn().mockResolvedValue(null) },
    });

    await service.recalculatePostActivity(88);

    expect(postRepository.update).toHaveBeenCalledWith(88, {
      last_activity_at: new Date('2026-08-01T10:00:00.000Z'),
    });
  });
});
