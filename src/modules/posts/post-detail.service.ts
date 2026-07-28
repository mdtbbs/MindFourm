import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Post } from '@entities/post.entity';
import { PostTag } from '@entities/post-tag.entity';
import { Reply } from '@entities/reply.entity';
import { getPrefixMetadata, parsePrefixCatalog, DEFAULT_POST_PREFIXES } from './post-prefixes.util';

export interface PostDetailTag {
  id: number;
  name: string;
  slug: string;
  created_at: Date;
}

export interface PostDetailReply {
  id: number;
  post_id: number;
  user_id: number;
  parent_reply_id: number | null;
  content: string;
  content_html: string | null;
  status: string;
  like_count: number;
  created_at: Date;
  updated_at: Date;
  author_mindauth_id: number | null;
  author_role: string | null;
  author_name: string | null;
  author_avatar_url: string | null;
}

export interface PostDetailDto {
  id: number;
  user_id: number;
  category_id: number | null;
  server_id: number | null;
  required_group_id: number | null;
  post_type: string;
  slug: string | null;
  title: string;
  content: string;
  content_html: string | null;
  status: string;
  is_pinned: boolean;
  is_locked: boolean;
  /** Id of the reply marked as the accepted answer, which is how the client highlights it. */
  best_reply_id: number | null;
  edited_at: Date | null;
  view_count: number;
  like_count: number;
  created_at: Date;
  updated_at: Date;
  category_name: string | null;
  category_slug: string | null;
  author_mindauth_id: number | null;
  author_role: string | null;
  author_name: string | null;
  author_avatar_url: string | null;
  prefix: { value: string; label: string; color: string } | null;
  tags: PostDetailTag[];
  replies?: PostDetailReply[];
  replyPagination?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

@Injectable()
export class PostDetailService {
  constructor(
    @InjectRepository(PostTag)
    private readonly postTagRepository: Repository<PostTag>,
  ) {}

  async toDetail(post: Post, prefixCatalog?: string | null): Promise<PostDetailDto> {
    const [tags] = await Promise.all([
      this.loadTags(post.id),
    ]);

    const catalog = parsePrefixCatalog(prefixCatalog ?? undefined);
    const prefixMeta = post.post_type !== 'normal'
      ? getPrefixMetadata(post.post_type, catalog)
      : null;

    return {
      id: post.id,
      user_id: post.user_id,
      category_id: post.category_id ?? null,
      server_id: post.server_id ?? null,
      required_group_id: post.required_group_id ?? null,
      post_type: post.post_type,
      slug: post.slug ?? null,
      title: post.title,
      content: post.content,
      content_html: post.content_html || null,
      status: post.status,
      is_pinned: Boolean(post.is_pinned),
      is_locked: Boolean(post.is_locked),
      best_reply_id: post.best_reply_id ?? null,
      edited_at: post.edited_at ?? null,
      view_count: post.view_count,
      like_count: post.like_count,
      created_at: post.created_at,
      updated_at: post.updated_at,
      category_name: post.category?.name || null,
      category_slug: post.category?.slug || null,
      author_mindauth_id: post.user?.mindauth_id ?? null,
      author_role: post.user?.role ?? null,
      author_name: post.user?.username ?? null,
      author_avatar_url: post.user?.avatar_url ?? null,
      prefix: prefixMeta ? { value: prefixMeta.value, label: prefixMeta.label, color: prefixMeta.color } : null,
      tags,
    };
  }

  async toReplies(replies: Reply[]): Promise<PostDetailReply[]> {
    if (replies.length === 0) {
      return [];
    }

    return replies.map((reply) => ({
      id: reply.id,
      post_id: reply.post_id,
      user_id: reply.user_id,
      parent_reply_id: reply.parent_reply_id ?? null,
      content: reply.content,
      content_html: reply.content_html || null,
      status: reply.status,
      like_count: reply.like_count,
      created_at: reply.created_at,
      updated_at: reply.updated_at,
      author_mindauth_id: reply.user?.mindauth_id ?? null,
      author_role: reply.user?.role ?? null,
      author_name: reply.user?.username ?? null,
      author_avatar_url: reply.user?.avatar_url ?? null,
    }));
  }

  private async loadTags(postId: number): Promise<PostDetailTag[]> {
    const postTags = await this.postTagRepository.find({
      where: { post_id: postId },
      relations: ['tag'],
    });

    return postTags
      .filter((postTag) => Boolean(postTag.tag))
      .map((postTag) => ({
        id: postTag.tag.id,
        name: postTag.tag.name,
        slug: postTag.tag.slug,
        created_at: postTag.tag.created_at,
      }));
  }
}
