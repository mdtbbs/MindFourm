import { BadRequestException } from '@nestjs/common';
import { PostsService } from './posts.service';

const at = (id: number, seconds: number) => ({ id, created_at: new Date(`2026-08-29T12:00:${seconds.toString().padStart(2, '0')}.000Z`) });

describe('PostsService cursor contract', () => {
  it('walks equal-timestamp rows exactly once using created_at then id DESC', async () => {
    const batches = [[at(105, 0), at(104, 0), at(103, 0)], [at(103, 0), at(102, 1), at(101, 1)], [at(101, 1)]];
    const builders: any[] = [];
    const postRepository: any = { createQueryBuilder: jest.fn(() => {
      const batchIndex = builders.length;
      const where: any[] = [];
      const builder: any = { leftJoinAndSelect: jest.fn().mockReturnThis(), andWhere: jest.fn((sql, params) => { where.push({ sql, params }); return builder; }), orderBy: jest.fn().mockReturnThis(), addOrderBy: jest.fn().mockReturnThis(), take: jest.fn().mockReturnThis(), getMany: jest.fn().mockResolvedValue(batches[batchIndex]) };
      builders.push(builder); return builder;
    }) };
    const summary: any = { toSummaryList: jest.fn(async (rows) => rows) };
    const service = new PostsService(postRepository, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, summary, {} as any);

    const first = await service.findAllCursor({ limit: 2 } as any);
    const second = await service.findAllCursor({ limit: 2, cursor: first.nextCursor! } as any);
    const third = await service.findAllCursor({ limit: 2, cursor: second.nextCursor! } as any);
    const ids = [...first.data, ...second.data, ...third.data].map((row: any) => row.id);

    expect(ids).toEqual([105, 104, 103, 102, 101]);
    expect(new Set(ids).size).toBe(ids.length);
    expect([first.hasMore, second.hasMore, third.hasMore]).toEqual([true, true, false]);
    expect(third.nextCursor).toBeNull();
    expect(builders[1].andWhere).toHaveBeenCalledWith(expect.stringContaining('post.created_at < :cursorValue'), expect.objectContaining({ cursorId: 104 }));
    expect(builders[1].addOrderBy).toHaveBeenCalledWith('post.id', 'DESC');
    await expect(service.findAllCursor({ limit: 2, cursor: 'not-a-cursor' } as any)).rejects.toBeInstanceOf(BadRequestException);
  });
});
