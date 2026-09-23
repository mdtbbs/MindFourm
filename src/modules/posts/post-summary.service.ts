import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Post } from '@entities/post.entity';
import { PostTag } from '@entities/post-tag.entity';
import { Reply } from '@entities/reply.entity';
import { ContentRelation } from '@entities/content-relation.entity';
import { VISIBLE_REPLY_STATUSES } from '@common/utils/constants';

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
  source: string;
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
  last_activity_at: Date;
  category_name: string | null;
  category_slug: string | null;
  category_color: string | null;
  category_icon: string | null;
  author_mindauth_id: number | null;
  author_role: string | null;
  author_name: string | null;
  author_avatar_url: string | null;
  tags: PostSummaryTag[];
}

@Injectable()
export class PostSummaryService {
  constructor(
    @InjectRepository(PostTag)
    private readonly postTagRepository: Repository<PostTag>,
    @InjectRepository(Reply)
    private readonly replyRepository: Repository<Reply>,
    @InjectRepository(ContentRelation)
    private readonly relationRepository: Repository<ContentRelation>,
  ) {}

  async toSummaryList(posts: Post[]): Promise<PostSummaryDto[]> {
    if (posts.length === 0) {
      return [];
    }

    const postIds = posts.map((post) => post.id);
    const [tagsByPostId, replyCounts, relations] = await Promise.all([
      this.loadTagsByPostId(postIds),
      this.loadReplyCounts(postIds),
      this.relationRepository.find({
        where: { source_type: 'post', source_id: In(postIds), target_type: 'game_server', relation_type: 'related' },
        select: ['source_id', 'target_id'],
      }),
    ]);
    const serverIdByPostId = new Map(relations.map((relation) => [relation.source_id, Number(relation.target_id)]));

    return posts.map((post) =>
      this.toSummary(
        post,
        tagsByPostId.get(post.id) || [],
        replyCounts.get(post.id) || 0,
        post.last_activity_at || post.created_at,
        serverIdByPostId.get(post.id) || null,
      ));
  }

  toSummary(post: Post, tags: PostSummaryTag[], replyCount: number, lastActivityAt: Date = post.created_at, serverId: number | null = null): PostSummaryDto {
    return {
      id: post.id,
      user_id: post.user_id,
      category_id: post.category_id ?? null,
      server_id: serverId,
      post_type: post.post_type,
      source: post.source || 'USER',
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
      last_activity_at: lastActivityAt,
      category_name: post.category?.name || null,
      category_slug: post.category?.slug || null,
      category_color: post.category?.color || null,
      category_icon: post.category?.icon || null,
      author_mindauth_id: post.user?.mindauth_id ?? null,
      author_role: post.user?.role ?? null,
      author_name: post.user?.username ?? null,
      author_avatar_url: post.user?.avatar_url ?? null,
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
    // Legacy imports sometimes persisted escaped JSON/HTML instead of Markdown.
    // Decode those safe textual representations before removing markup.
    const normalized = input
      .replace(/\\([\\"/bnrt])/g, (_match, token: string) => ({ '\\': '\\', '"': '"', '/': '/', b: ' ', n: ' ', r: ' ', t: ' ' }[token] || token))
      .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
        const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
        if (entity[0] !== '#') return named[entity.toLowerCase()] || match;
        const codePoint = entity.slice(1, 2).toLowerCase() === 'x' ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
        return Number.isSafeInteger(codePoint) ? String.fromCodePoint(codePoint) : match;
      });
    return normalized
      .replace(/<[^>]*>/g, ' ')
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
      .andWhere('reply.status IN (:...statuses)', { statuses: VISIBLE_REPLY_STATUSES })
      .groupBy('reply.post_id')
      .getRawMany<{ post_id: string; count: string }>();

    const counts = new Map<number, number>();
    for (const row of rows) {
      counts.set(parseInt(row.post_id, 10), parseInt(row.count, 10));
    }

    return counts;
  }
}
