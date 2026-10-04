import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Reply } from '@entities/reply.entity';
import { Resource } from '@entities/resource.entity';
import { LikesService } from '../likes/likes.service';
import { RepliesService } from '../replies/replies.service';
import { CreateResourceCommentDto } from './dto/create-resource-comment.dto';
import { UpdateResourceCommentDto } from './dto/update-resource-comment.dto';

const VISIBLE_RESOURCE_STATUSES = new Set(['approved', 'published']);
const VISIBLE_REPLY = 'published';

type DiscussionResourceRow = {
  id: number;
  user_id: number;
  title: string;
  description?: string | null;
  content?: string | null;
  content_html?: string | null;
  content_json?: Record<string, unknown> | string | null;
  content_schema_version?: number | null;
  content_text?: string | null;
  content_language: string | null;
  status: string;
  is_public: number | string;
  visibility: string | null;
  category_id: number | null;
  discussion_thread_id: number | null;
};

@Injectable()
export class ResourceCommentsService {
  constructor(
    @InjectRepository(Resource) private readonly resourceRepo: Repository<Resource>,
    @InjectRepository(Reply) private readonly replyRepo: Repository<Reply>,
    private readonly dataSource: DataSource,
    private readonly replies: RepliesService,
    private readonly likes: LikesService,
  ) {}

  /**
   * Resource comments are now a compatibility projection over the resource's
   * canonical forum thread. This guarantees that writes use RepliesService's
   * moderation, notifications, activity and rich-content policy.
   */
  async findByResource(resourceId: number, page = 1, limit = 20) {
    const boundedPage = Math.max(1, Math.trunc(Number(page)) || 1);
    const boundedLimit = Math.min(100, Math.max(1, Math.trunc(Number(limit)) || 20));
    const discussionThreadId = await this.ensureDiscussionThread(resourceId);
    const [rows, total] = await this.replyRepo.findAndCount({
      where: { post_id: discussionThreadId, status: VISIBLE_REPLY },
      relations: ['user'],
      select: {
        id: true, post_id: true, user_id: true, parent_reply_id: true, content: true,
        content_html: true, content_json: true, content_schema_version: true, content_text: true,
        status: true, like_count: true, created_at: true, updated_at: true,
        user: { id: true, username: true, avatar_url: true },
      },
      order: { created_at: 'ASC', id: 'ASC' },
      skip: (boundedPage - 1) * boundedLimit,
      take: boundedLimit,
    });
    return {
      data: rows.map((reply) => this.toResourceComment(resourceId, reply)),
      pagination: {
        page: boundedPage,
        limit: boundedLimit,
        total,
        totalPages: Math.ceil(total / boundedLimit),
      },
      discussion_thread_id: discussionThreadId,
      discussion_thread_url: `/posts/${discussionThreadId}`,
    };
  }

  async create(
    resourceId: number,
    userId: number,
    dto: CreateResourceCommentDto,
    provenance: { ipAddress?: string; locationLabel?: string | null } = {},
  ) {
    const postId = await this.ensureDiscussionThread(resourceId);
    const reply = await this.replies.createReplyForPost(postId, {
      content: dto.content,
      content_json: dto.content_json,
      content_schema_version: dto.content_schema_version,
      parent_reply_id: dto.parent_comment_id || undefined,
    }, userId, provenance);
    return this.toResourceComment(resourceId, reply);
  }

  async update(id: number, userId: number, dto: UpdateResourceCommentDto, role?: string) {
    const resourceId = await this.resourceIdForReply(id);
    const reply = await this.replies.update(id, dto.content, userId, role);
    return this.toResourceComment(resourceId, reply);
  }

  async delete(id: number, userId: number, role: string) {
    await this.resourceIdForReply(id);
    await this.replies.softDelete(id, userId, role);
    return { success: true };
  }

  async incrementLike(id: number, userId: number): Promise<void> {
    await this.resourceIdForReply(id);
    await this.likes.likeReply(userId, id);
  }

  async decrementLike(id: number, userId: number): Promise<void> {
    await this.resourceIdForReply(id);
    await this.likes.unlikeReply(userId, id);
  }

  private async resourceIdForReply(replyId: number): Promise<number> {
    const reply = await this.replyRepo.findOne({ where: { id: replyId } });
    if (!reply) throw new NotFoundException('Resource discussion reply not found');
    const resource = await this.resourceRepo.findOne({
      where: { discussion_thread_id: reply.post_id },
      select: ['id', 'discussion_thread_id', 'is_public', 'status', 'visibility', 'category_id'],
    });
    if (!resource || !this.isPublic(resource)) {
      throw new NotFoundException('Resource discussion reply not found');
    }
    if (resource.category_id) {
      const categories = await this.dataSource.query(
        'SELECT is_active FROM resource_categories WHERE id = ?',
        [resource.category_id],
      );
      if (!categories[0] || Number(categories[0].is_active) !== 1) {
        throw new NotFoundException('Resource discussion reply not found');
      }
    }
    return resource.id;
  }

  /** Serialize on the Resource row so concurrent detail visits cannot create duplicate threads. */
  private async ensureDiscussionThread(resourceId: number): Promise<number> {
    return this.dataSource.transaction(async (manager) => {
      const rows = await manager.query(
        `SELECT id, user_id, title, description, content, content_html, content_json,
                content_schema_version, content_text, content_language, status, is_public, visibility,
                category_id, discussion_thread_id
           FROM resources
          WHERE id = ? AND deleted_at IS NULL
          FOR UPDATE`,
        [resourceId],
      ) as DiscussionResourceRow[];
      const resource = rows[0];
      if (!resource || !this.isPublic(resource)) throw new NotFoundException('Resource not found');
      if (resource.category_id) {
        const categories = await manager.query('SELECT is_active FROM resource_categories WHERE id = ?', [resource.category_id]);
        if (!categories[0] || Number(categories[0].is_active) !== 1) throw new NotFoundException('Resource not found');
      }

      if (resource.discussion_thread_id) {
        const existing = await manager.query(
          `SELECT id, status, post_type, source FROM posts
            WHERE id = ? AND deleted_at IS NULL`,
          [resource.discussion_thread_id],
        );
        if (existing[0]?.post_type === 'resource_discussion' && existing[0]?.source === 'SYSTEM') {
          if (
            existing[0].status !== 'published'
            && ['draft', 'pending'].includes(existing[0].status)
          ) {
            await manager.query('UPDATE posts SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', ['published', existing[0].id]);
          } else if (existing[0].status !== 'published') {
            throw new NotFoundException('Resource discussion not found');
          }
          return Number(existing[0].id);
        }
      }

      const now = new Date();
      const result = await manager.query(
        `INSERT INTO posts (
           user_id, post_type, source, title, content, content_html, content_json,
           content_schema_version, content_text, content_language, status, is_pinned,
           is_locked, view_count, like_count, last_activity_at, created_at, updated_at
         ) VALUES (?, 'resource_discussion', 'SYSTEM', ?, ?, ?, ?, ?, ?, ?, 'published', 0, 0, 0, 0, ?, ?, ?)`,
        [
          resource.user_id,
          this.boundedTitle(`Resource discussion: ${resource.title || `#${resourceId}`}`),
          resource.content || resource.description || '',
          resource.content_html || null,
          this.serializedRichDocument(resource.content_json),
          resource.content_schema_version || 2,
          resource.content_text || resource.content || resource.description || '',
          resource.content_language || 'unknown',
          now,
          now,
          now,
        ],
      );
      const postId = Number(result?.insertId ?? result?.[0]?.insertId);
      if (!Number.isInteger(postId) || postId <= 0) throw new Error('Could not create the resource discussion thread');
      await manager.query('UPDATE resources SET discussion_thread_id = ? WHERE id = ?', [postId, resourceId]);
      return postId;
    });
  }

  private isPublic(resource: Pick<DiscussionResourceRow, 'is_public' | 'status' | 'visibility'>): boolean {
    return Number(resource.is_public) === 1
      && VISIBLE_RESOURCE_STATUSES.has(resource.status || '')
      && (resource.visibility == null || resource.visibility === 'public');
  }

  private serializedRichDocument(value: DiscussionResourceRow['content_json']): string | null {
    if (value == null) return null;
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? JSON.stringify(parsed) : null;
      } catch {
        return null;
      }
    }
    return typeof value === 'object' && !Array.isArray(value) ? JSON.stringify(value) : null;
  }

  private boundedTitle(value: string): string {
    const points = Array.from(value);
    return points.length > 255 ? points.slice(0, 255).join('') : value;
  }

  private toResourceComment(resourceId: number, reply: any) {
    const editedAt = reply.updated_at && reply.created_at
      && new Date(reply.updated_at).getTime() > new Date(reply.created_at).getTime()
      ? reply.updated_at
      : null;
    return {
      id: reply.id,
      resource_id: resourceId,
      user_id: reply.user_id,
      parent_id: reply.parent_reply_id ?? null,
      content: reply.content,
      content_html: reply.content_html ?? null,
      content_json: reply.content_json ?? null,
      content_schema_version: reply.content_schema_version || 2,
      content_text: reply.content_text ?? null,
      status: 'visible',
      edited_at: editedAt,
      upvote_count: Number(reply.like_count || 0),
      downvote_count: 0,
      report_count: 0,
      created_at: reply.created_at,
      updated_at: reply.updated_at,
      username: reply.user?.username || null,
      avatar_url: reply.user?.avatar_url || null,
    };
  }
}
