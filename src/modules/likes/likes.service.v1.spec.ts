import { NotFoundException } from '@nestjs/common';
import { LikesService } from './likes.service';

describe('LikesService V1 idempotency', () => {
  const postLikeRepo = { findOne: jest.fn() };
  const postRepo = { findOne: jest.fn() };
  const service = new LikesService(
    postLikeRepo as any,
    {} as any,
    postRepo as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  beforeEach(() => jest.clearAllMocks());

  it('makes an already-unliked existing post a successful no-op', async () => {
    postRepo.findOne.mockResolvedValue({ id: 9, like_count: 3 });
    postLikeRepo.findOne.mockResolvedValue(null);

    await expect(service.ensurePostUnliked(7, 9)).resolves.toEqual({ liked: false, count: 3 });
  });

  it('does not turn a missing thread into a successful DELETE', async () => {
    postRepo.findOne.mockResolvedValue(null);

    await expect(service.ensurePostUnliked(7, 999)).rejects.toBeInstanceOf(NotFoundException);
  });
});
