import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Post } from '@entities/post.entity';
import { applyPostVisibility, PostViewer } from '@common/utils/post-visibility.util';

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
  author: { id: number; username: string; avatar_url: string | null } | null;
  category: { id: number; name: string; slug: string | null } | null;
  excerpt: string;
};

@Injectable()
export class ThreadReadAdapterService {
  constructor(
    @InjectRepository(Post)
    private readonly postRepo: Repository<Post>,
  ) {}

  async getThreadV1(postId: number, viewer?: PostViewer): Promise<V1ThreadDto | null> {
    const qb = this.postRepo.createQueryBuilder('post').leftJoinAndSelect('post.user', 'author').leftJoinAndSelect('post.category', 'category').where('post.id = :id', { id: postId });
    applyPostVisibility(qb, 'post', viewer, 'published');
    this.selectCards(qb);
    const result = await qb.getRawAndEntities();
    const post = result.entities[0];
    if (post) post.content_text = result.raw[0]?.post_card_excerpt ?? '';
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
      author: post.user ? { id: post.user.id, username: post.user.username, avatar_url: post.user.avatar_url || null } : null,
      category: post.category ? { id: post.category.id, name: post.category.name, slug: post.category.slug || null } : null,
      excerpt: this.excerpt(post.content_text || post.content),
    };
  }

  async listThreadsV1(params: {
    limit: number;
    categoryId?: number;
    offset?: number;
    viewer?: PostViewer;
  }): Promise<V1ThreadDto[]> {
    const qb = this.postRepo.createQueryBuilder('post')
      .leftJoinAndSelect('post.user', 'author')
      .leftJoinAndSelect('post.category', 'category')
      .where('post.status = :status', { status: 'published' })
      .andWhere('post.deleted_at IS NULL')
      .andWhere(params.categoryId ? 'post.category_id = :categoryId' : 'post.source = :source',
        params.categoryId ? { categoryId: params.categoryId } : { source: 'USER' })
      .orderBy('post.is_pinned', 'DESC')
      .addOrderBy('post.created_at', 'DESC')
      .take(Math.min(50, Math.max(1, params.limit))).skip(params.offset || 0);
    applyPostVisibility(qb, 'post', params.viewer, 'published');
    this.selectCards(qb);
    const result = await qb.getRawAndEntities();
    const excerpts = new Map(result.raw.map(row => [Number(row.post_id), row.post_card_excerpt]));
    const posts = result.entities;
    for (const post of posts) post.content_text = excerpts.get(post.id) ?? '';

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
        author: post.user ? { id: post.user.id, username: post.user.username, avatar_url: post.user.avatar_url || null } : null,
        category: post.category ? { id: post.category.id, name: post.category.name, slug: post.category.slug || null } : null,
        excerpt: this.excerpt(post.content_text || post.content),
      }));
  }

  async countThreadsV1(categoryId?: number, viewer?: PostViewer): Promise<number> {
    const query = this.postRepo.createQueryBuilder('post')
      .where('post.status = :status', { status: 'published' })
      .andWhere('post.deleted_at IS NULL');
    if (categoryId) query.andWhere('post.category_id = :categoryId', { categoryId });
    else query.andWhere('post.source = :source', { source: 'USER' });
    applyPostVisibility(query, 'post', viewer, 'published');
    return query.getCount();
  }

  private selectCards(qb: ReturnType<Repository<Post>['createQueryBuilder']>) {
    qb.select(['post.id', 'post.title', 'post.slug', 'post.status', 'post.is_pinned', 'post.is_locked',
      'post.view_count', 'post.created_at', 'post.updated_at', 'post.category_id', 'post.user_id',
      'author.id', 'author.username', 'author.avatar_url', 'category.id', 'category.name', 'category.slug'])
      .addSelect("LEFT(COALESCE(NULLIF(post.content_text, ''), post.content), 512)", 'post_card_excerpt');
  }

  private excerpt(content: string | null | undefined): string {
    const text = String(content || '').replace(/<[^>]*>/g, ' ').replace(/[#>*_~`-]+/g, ' ').replace(/\s+/g, ' ').trim();
    return text.length > 180 ? `${text.slice(0, 177)}...` : text;
  }
}
