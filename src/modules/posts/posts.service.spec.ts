import { PostsService } from './posts.service';

function createService(overrides: {
  postRepository?: Record<string, jest.Mock>;
  postSummaryService?: Record<string, jest.Mock>;
} = {}) {
  const postRepository = {
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    update: jest.fn(),
    increment: jest.fn(),
    softDelete: jest.fn(),
    delete: jest.fn(),
    ...overrides.postRepository,
  };
  const postSummaryService = {
    toSummaryList: jest.fn().mockResolvedValue([]),
    ...overrides.postSummaryService,
  };

  const service = new PostsService(
    postRepository as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    { get: jest.fn(), set: jest.fn(), del: jest.fn() } as any,
    {} as any,
    {} as any,
    { execute: jest.fn() } as any,
    {} as any,
    {} as any,
    { getBoolean: jest.fn() } as any,
    postSummaryService as any,
  );

  return {
    service,
    postRepository,
    postSummaryService,
  };
}

describe('PostsService', () => {
  it('returns public list summaries and defaults to published posts', async () => {
    const { service, postRepository, postSummaryService } = createService({
      postRepository: {
        findAndCount: jest.fn().mockResolvedValue([
          [
            {
              id: 12,
              title: 'Public post',
            },
          ],
          1,
        ]),
      },
      postSummaryService: {
        toSummaryList: jest.fn().mockResolvedValue([
          {
            id: 12,
            title: 'Public post',
            excerpt: 'summary',
          },
        ]),
      },
    });

    const result = await service.findAll({ page: 1, limit: 20 });

    expect(postRepository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'published' },
      }),
    );
    expect(postSummaryService.toSummaryList).toHaveBeenCalledWith([
      expect.objectContaining({ id: 12 }),
    ]);
    expect(result).toMatchObject({
      data: [
        {
          id: 12,
          title: 'Public post',
          excerpt: 'summary',
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
  });
});
