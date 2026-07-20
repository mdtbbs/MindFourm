import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Post } from '@entities/post.entity';
import { PostTag } from '@entities/post-tag.entity';
import { Reply } from '@entities/reply.entity';

export interface PostSummaryTag {
  id: number;
  name: string;
  slug: string;
  created_at: Date;
}

export interface PostSummaryDto {
  id: number;
  user_id: number;
  category_id: number | null;
  server_id: number | null;
  post_type: string;
  slug: string | null;
  title: string;
  excerpt: string;
  status: string;
  is_pinned: boolean;
  view_count: number;
  reply_count: number;
  like_count: number;
  created_at: Date;
  updated_at: Date;
  category_name: string | null;
  category_slug: string | null;
  author_mindauth_id: number | null;
  author_role: string | null;
  tags: PostSummaryTag[];
}

@Injectable()
export class PostSummaryService {
  constructor(
    @InjectRepository(PostTag)
    private readonly postTagRepository: Repository<PostTag>,
    @InjectRepository(Reply)
    private readonly replyRepository: Repository<Reply>,
  ) {}

  async toSummaryList(posts: Post[]): Promise<PostSummaryDto[]> {
    if (posts.length === 0) {
      return [];
    }

    const postIds = posts.map((post) => post.id);
    const [tagsByPostId, replyCounts] = await Promise.all([
      this.loadTagsByPostId(postIds),
      this.loadReplyCounts(postIds),
    ]);

    return posts.map((post) =>
      this.toSummary(
        post,
        tagsByPostId.get(post.id) || [],
        replyCounts.get(post.id) || 0,
      ));
  }

  toSummary(post: Post, tags: PostSummaryTag[], replyCount: number): PostSummaryDto {
    return {
      id: post.id,
      user_id: post.user_id,
      category_id: post.category_id ?? null,
      server_id: post.server_id ?? null,
      post_type: post.post_type,
      slug: post.slug ?? null,
      title: post.title,
      excerpt: this.buildExcerpt(post.content),
      status: post.status,
      is_pinned: Boolean(post.is_pinned),
      view_count: post.view_count,
      reply_count: replyCount,
      like_count: post.like_count,
      created_at: post.created_at,
      updated_at: post.updated_at,
      category_name: post.category?.name || null,
      category_slug: post.category?.slug || null,
      author_mindauth_id: post.user?.mindauth_id ?? null,
      author_role: post.user?.role ?? null,
      tags,
    };
  }

  buildExcerpt(content: string | null | undefined, maxLength: number = 120): string {
    const stripped = this.stripMarkdown(content || '');
    if (stripped.length <= maxLength) {
      return stripped;
    }

    return `${stripped.slice(0, maxLength)}...`;
  }

  private stripMarkdown(input: string): string {
    return input
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[#>*_~\-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async loadTagsByPostId(postIds: number[]): Promise<Map<number, PostSummaryTag[]>> {
    const postTags = await this.postTagRepository.find({
      where: {
        post_id: In(postIds),
      },
      relations: ['tag'],
    });

    const tagsByPostId = new Map<number, PostSummaryTag[]>();
    for (const postId of postIds) {
      tagsByPostId.set(postId, []);
    }

    for (const postTag of postTags) {
      if (!postTag.tag) {
        continue;
      }

      const tags = tagsByPostId.get(postTag.post_id);
      if (!tags) {
        continue;
      }

      tags.push({
        id: postTag.tag.id,
        name: postTag.tag.name,
        slug: postTag.tag.slug,
        created_at: postTag.tag.created_at,
      });
    }

    return tagsByPostId;
  }

  private async loadReplyCounts(postIds: number[]): Promise<Map<number, number>> {
    const rows = await this.replyRepository
      .createQueryBuilder('reply')
      .select('reply.post_id', 'post_id')
      .addSelect('COUNT(reply.id)', 'count')
      .where('reply.post_id IN (:...postIds)', { postIds })
      // Historical data uses both "active" and "published" for visible replies.
      .andWhere('reply.status IN (:...statuses)', { statuses: ['active', 'published'] })
      .groupBy('reply.post_id')
      .getRawMany<{ post_id: string; count: string }>();

    const counts = new Map<number, number>();
    for (const row of rows) {
      counts.set(parseInt(row.post_id, 10), parseInt(row.count, 10));
    }

    return counts;
  }
}
