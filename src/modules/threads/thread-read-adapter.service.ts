import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Post } from '@entities/post.entity';

/**
 * Thread V1 Read Adapter.
 *
 * Projects existing Post records as V1 Thread DTOs.
 * No table rename — the `posts` table remains authoritative.
 */

export type V1ThreadDto = {
  public_id: string | null;
  id: number;
  title: string;
  slug: string | null;
  status: string;
  is_pinned: boolean;
  is_locked: boolean;
  view_count: number;
  reply_count: number;
  created_at: string;
  updated_at: string;
  category_id: number | null;
  user_id: number;
};

@Injectable()
export class ThreadReadAdapterService {
  constructor(
    @InjectRepository(Post)
    private readonly postRepo: Repository<Post>,
  ) {}

  async getThreadV1(postId: number): Promise<V1ThreadDto | null> {
    const post = await this.postRepo.findOne({ where: { id: postId } });
    if (!post || (post as any).deleted_at) return null;
    if (post.status !== 'published') return null;

    return {
      public_id: null, // public_id for posts is a future task
      id: post.id,
      title: post.title,
      slug: post.slug || null,
      status: post.status,
      is_pinned: !!(post as any).is_pinned,
      is_locked: !!(post as any).is_locked,
      view_count: (post as any).view_count || 0,
      reply_count: (post as any).reply_count || 0,
      created_at: post.created_at?.toISOString() || '',
      updated_at: post.updated_at?.toISOString() || '',
      category_id: post.category_id || null,
      user_id: post.user_id,
    };
  }

  async listThreadsV1(params: {
    limit: number;
    categoryId?: number;
    offset?: number;
  }): Promise<V1ThreadDto[]> {
    const where: any = { status: 'published' };
    if (params.categoryId) where.category_id = params.categoryId;

    const posts = await this.postRepo.find({
      where,
      order: { created_at: 'DESC' },
      take: params.limit,
      skip: params.offset || 0,
    });

    return posts
      .filter(p => !(p as any).deleted_at)
      .map(post => ({
        public_id: null,
        id: post.id,
        title: post.title,
        slug: post.slug || null,
        status: post.status,
        is_pinned: !!(post as any).is_pinned,
        is_locked: !!(post as any).is_locked,
        view_count: (post as any).view_count || 0,
        reply_count: (post as any).reply_count || 0,
        created_at: post.created_at?.toISOString() || '',
        updated_at: post.updated_at?.toISOString() || '',
        category_id: post.category_id || null,
        user_id: post.user_id,
      }));
  }
}
