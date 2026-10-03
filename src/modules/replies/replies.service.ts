import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Reply } from '../../entities/reply.entity';
import { Post } from '../../entities/post.entity';
import { User } from '../../entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { AdminNotificationsService } from '../admin-notifications/admin-notifications.service';
import { EventBusService } from '../plugins/event-bus.service';
import { CreateReplyDto } from './dto/create-reply.dto';
import { collectDraftAttachmentTokens, collectTiptapMentionIds, replaceDraftAttachmentTokens, resolveContentSource } from '../../common/utils/tiptap-content.util';
import { PointsService } from '../points/points.service';
import { SettingsService } from '../settings/settings.service';
import { RedisService } from '../../database/redis.service';
import { REPLY_STATUS } from '../../common/utils/constants';
import { ContentSafetyService } from '../content-safety/content-safety.service';
import { PostActivityService } from '../posts/post-activity.service';
import { CustomEmojisService } from '../custom-emojis/custom-emojis.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { PostsService } from '../posts/posts.service';
import { PostViewer } from '@common/utils/post-visibility.util';
import { EventsService } from '../events/events.service';

type PublicReply = Omit<Reply, 'ip_address' | 'user'> & {
  user: Pick<User, 'id' | 'username' | 'role' | 'avatar_url'> | null;
};

function toPublicReply(reply: Reply): PublicReply {
  const { ip_address: _ipAddress, user, ...publicFields } = reply;
  void _ipAddress;
  return {
    ...publicFields,
    user: user ? {
      id: user.id,
      username: user.username,
      role: user.role,
      avatar_url: user.avatar_url,
    } : null,
  };
}

@Injectable()
export class RepliesService {
  onModuleInit(): void {
    this.events?.register('ForumReplyPublished', async (event) => this.deliverReplyEffects(event.aggregate_id, event.payload_json?.mention_user_ids));
  }

  private async deliverReplyEffects(replyId: number, explicitMentionIds?: number[] | null): Promise<void> {
    const reply = await this.replyRepository.findOne({ where: { id: replyId } });
    if (!reply || reply.status !== REPLY_STATUS.published) return;
    const post = await this.postRepository.findOne({ where: { id: reply.post_id } });
    if (!post || post.status !== 'published') return;
    await this.postActivityService.markPostActive(post.id, reply.created_at);
    await this.invalidatePostCache(post.id);
    if (post.user_id !== reply.user_id && await this.notificationsService.canReceivePostNotification(post.id, post.user_id)) await this.notificationsService.create({ user_id: post.user_id, type: 'reply', actor_id: reply.user_id, post_id: post.id, reply_id: reply.id, content: reply.content });
    const storedIds = reply.content_json ? collectTiptapMentionIds(reply.content_json) : [];
    const mentionIds = explicitMentionIds === undefined ? (storedIds.length ? storedIds : null) : explicitMentionIds;
    if (mentionIds !== null) await this.notificationsService.notifyMentionedUserIds(mentionIds, post.id, reply.user_id, reply.content, reply.id, [], true);
    else await this.notificationsService.notifyMentionedUsers(reply.content, post.id, reply.user_id, reply.id, [], true);
    await this.pointsService.awardPoints(reply.user_id, 'create_reply', 'reply', reply.id, true);
  }

  constructor(
    @InjectRepository(Reply)
    private replyRepository: Repository<Reply>,
    @InjectRepository(Post)
    private postRepository: Repository<Post>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private notificationsService: NotificationsService,
    private adminNotificationsService: AdminNotificationsService,
    private eventBus: EventBusService,
    private pointsService: PointsService,
    private settingsService: SettingsService,
    private redisService: RedisService,
    private postActivityService: PostActivityService,
    private contentSafety?: ContentSafetyService,
    @Optional() private customEmojis?: CustomEmojisService,
    @Optional() private dataSource?: DataSource,
    @Optional() private attachmentsService?: AttachmentsService,
    @Optional() private postsService?: PostsService,
    @Optional() private events?: EventsService,
  ) {}

  async createReplyForPost(
    postId: number,
    dto: CreateReplyDto,
    userId: number,
    provenance: { ipAddress?: string; locationLabel?: string | null } = {},
  ): Promise<PublicReply> {
    // Execute "before" hook
    let modifiedDto = await this.eventBus.execute('reply.create', { ...dto, postId, userId });
    dto = modifiedDto;
    const richJsonWrite = dto.content_json !== undefined && dto.content_json !== null;
    const canonicalJson = dto.content_json && this.customEmojis
      ? await this.customEmojis.canonicalizeDocument(dto.content_json, dto.content_schema_version || 1, false, true)
      : dto.content_json;
    await this.canonicalizeMentionSnapshots(canonicalJson);
    const contentSource = resolveContentSource(dto.content, canonicalJson, dto.content_schema_version, { allowDraftAttachments: true });
    const content = contentSource.content;
    dto.content = content;
    const parent_reply_id = dto.parent_reply_id;

    // Validate post exists and is published
    const post = await this.postRepository.findOne({
      where: { id: postId },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (post.status !== 'published') {
      throw new ForbiddenException('Cannot reply to unpublished post');
    }

    // Enforced here rather than by hiding the composer: the client is not the security
    // boundary, and this is the only path that writes a reply, so it is the only place
    // the lock can actually hold.
    //
    // Applies to moderators too. A lock is a statement about the thread, not about who
    // is asking — a moderator who needs to post an explanation unlocks it first, which
    // leaves an operation-log entry saying so. It is also the only rule this method can
    // enforce honestly: it is handed a user id and no role, so a staff exemption would
    // mean plumbing privilege into a code path that has never needed it.
    if (post.is_locked) {
      throw new ForbiddenException('帖子已锁定，无法回复');
    }

    // If replying to a parent reply, validate it exists
    if (parent_reply_id) {
      const parentReply = await this.replyRepository.findOne({
        where: { id: parent_reply_id },
      });

      if (!parentReply) {
        throw new NotFoundException('Parent reply not found');
      }

      if (parentReply.status !== REPLY_STATUS.published) throw new NotFoundException('Parent reply not found');

      if (parentReply.post_id !== postId) {
        throw new ForbiddenException('Parent reply does not belong to this post');
      }
    }

    const contentHtml = contentSource.content_html;

    // Get current user for response
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }
    await this.assertParentVisible(post, { id: userId, role: user.role || 'user' });
    await this.postsService?.assertDocumentQuoteVisibility(contentSource.content_json, { id: userId, role: user.role });

    const risk = this.contentSafety
      ? await this.contentSafety.assess(content, { actorId: userId, surface: 'reply' })
      : { score: 0, rules: [], mustReview: false };
    const requiresApproval = risk.mustReview || await this.settingsService.getBoolean('require_reply_approval', true);

    // Create reply
    const newReply = this.replyRepository.create({
      post_id: postId,
      user_id: userId,
      parent_reply_id: parent_reply_id,
      content,
      content_html: contentHtml,
      content_json: contentSource.content_json,
      content_text: contentSource.content_text,
      content_schema_version: contentSource.content_schema_version,
      status: requiresApproval ? REPLY_STATUS.pending : REPLY_STATUS.published,
      like_count: 0,
      ip_address: provenance.ipAddress || null,
      location_label: provenance.locationLabel || null,
    });

    const savedReply = await this.saveReplyWithAttachments(newReply, contentSource.content_json, userId, true, richJsonWrite ? collectTiptapMentionIds(contentSource.content_json) : null);
    if (!this.events && savedReply.status === REPLY_STATUS.published) {
      await this.postActivityService.markPostActive(postId, savedReply.created_at || new Date()).catch((error) => console.warn('Reply activity update failed after commit:', error.message));
    }
    if (this.contentSafety) {
      await this.contentSafety.recordFlag({ userId, targetType: 'reply', targetId: savedReply.id, risk, ipAddress: provenance.ipAddress }).catch(() => undefined);
    }
    await this.invalidatePostCache(postId).catch((error) => console.warn('Reply cache invalidation failed:', error.message));

    if (!this.events) {
      try {
    // Compatibility for isolated tests/embedders without the durable event module.
    // Create notification for post author (if not the same user)
    if (savedReply.status === 'published' && post.user_id !== userId && (!post.required_group_id || await this.notificationsService.canReceivePostNotification(post.id, post.user_id))) {
      await this.notificationsService.create({
        user_id: post.user_id,
        type: 'reply',
        actor_id: userId,
        post_id: postId,
        reply_id: savedReply.id,
        content: content,
      });
    }

    if (savedReply.status === 'published') {
      if (richJsonWrite) {
        await this.notificationsService.notifyMentionedUserIds(
          collectTiptapMentionIds(savedReply.content_json), postId, userId, content, savedReply.id,
        );
      } else {
        await this.notificationsService.notifyMentionedUsers(content, postId, userId, savedReply.id);
      }

      // Award points for creating reply
      await this.awardPointsForReply(savedReply.id, userId);
    }
      } catch (error) { console.warn('Reply effects failed after commit:', (error as Error).message); }
    }
    if (savedReply.status === 'pending') {
      this.adminNotificationsService.publishModerationPending({
        item_type: 'reply',
        item_id: savedReply.id,
        title: `帖子 #${postId} 的新回复`,
        content,
        author_username: user.username || `#${userId}`,
        action_url: '/admin/content/moderation?type=replies',
      }).catch((err) =>
        console.error('Admin reply moderation notification error:', err),
      );
    }

    // Execute "after" hook
    this.eventBus.execute('reply.created', { reply: savedReply, userId }).catch((err) =>
      console.error('reply.created hook error:', err),
    );

    return toPublicReply(savedReply);
  }

  async awardPointsForReply(replyId: number, userId: number): Promise<void> {
    await this.pointsService.awardPoints(userId, 'create_reply', 'reply', replyId);
  }

  async getByPostId(postId: number, page: number = 1, limit: number = 20, viewer?: PostViewer): Promise<{ data: PublicReply[]; total: number; page: number; totalPages: number }> {
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1) throw new BadRequestException('Invalid pagination');
    limit = Math.min(limit, 50);
    const post = await this.postRepository.findOne({ where: { id: postId }, select: ['id', 'post_type', 'status', 'user_id', 'required_group_id'] });
    if (!post) throw new NotFoundException('Post not found');
    await this.assertParentVisible(post, viewer);
    const skip = (page - 1) * limit;

    const [replies, total] = await this.replyRepository.findAndCount({
      where: {
        post_id: postId,
        status: REPLY_STATUS.published,
      },
      relations: ['user'],
      order: {
        created_at: 'ASC',
      },
      skip,
      take: limit,
    });

    return {
      data: replies.map(toPublicReply),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: number, viewer?: PostViewer): Promise<PublicReply> {
    const reply = await this.replyRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!reply) {
      throw new NotFoundException('Reply not found');
    }

    if (reply.status === 'deleted' || (reply.status !== REPLY_STATUS.published && reply.user_id !== viewer?.id && !['admin', 'moderator'].includes(viewer?.role || ''))) {
      throw new NotFoundException('Reply not found');
    }
    const post = await this.postRepository.findOne({ where: { id: reply.post_id }, select: ['id', 'post_type', 'status', 'user_id', 'required_group_id'] });
    if (!post) throw new NotFoundException('Post not found');
    await this.assertParentVisible(post, viewer);
    return toPublicReply(reply);
  }

  async update(id: number, content: string | undefined, userId: number, userRole?: string, contentJson?: unknown, schemaVersion?: number): Promise<PublicReply> {
    const reply = await this.replyRepository.findOne({
      where: { id },
    });

    if (!reply) {
      throw new NotFoundException('Reply not found');
    }

    const canEditAny = userRole === 'admin' || userRole === 'moderator';
    if (reply.user_id !== userId && !canEditAny) {
      throw new ForbiddenException('You can only edit your own replies');
    }

    if (reply.status === 'deleted') {
      throw new ForbiddenException('Cannot update deleted reply');
    }

    const richJsonWrite = contentJson !== undefined && contentJson !== null;
    const canonicalJson = contentJson && this.customEmojis
      ? await this.customEmojis.canonicalizeDocument(contentJson, schemaVersion || 1, false, true)
      : contentJson;
    await this.canonicalizeMentionSnapshots(canonicalJson);
    const previousMentionIds = reply.content_json ? collectTiptapMentionIds(reply.content_json) : [];
    const contentSource = resolveContentSource(content, canonicalJson, schemaVersion, { allowDraftAttachments: true });
    if (richJsonWrite) await this.postsService?.assertDocumentQuoteVisibility(contentSource.content_json, { id: userId, role: userRole || 'user' });
    reply.content = contentSource.content;
    reply.content_html = contentSource.content_html;
    reply.content_json = contentSource.content_json;
    reply.content_text = contentSource.content_text;
    reply.content_schema_version = contentSource.content_schema_version;
    reply.updated_at = new Date();

    const post = await this.postRepository.findOne({ where: { id: reply.post_id }, select: ['id', 'post_type', 'status', 'user_id', 'required_group_id'] });
    if (!post) throw new NotFoundException('Post not found');
    await this.assertParentVisible(post, { id: userId, role: userRole || 'user' });
    const saved = await this.saveReplyWithAttachments(reply, contentSource.content_json, userId);
    if (richJsonWrite && saved.status === REPLY_STATUS.published) {
      const added = collectTiptapMentionIds(saved.content_json).filter((mentionId) => !previousMentionIds.includes(mentionId));
      if (added.length) await this.notificationsService.notifyMentionedUserIds(added, saved.post_id, userId, saved.content, saved.id).catch((error) => console.warn('Reply edit notification failed after commit:', error.message));
    }
    await this.invalidatePostCache(reply.post_id).catch((error) => console.warn('Reply edit cache invalidation failed after commit:', error.message));
    return toPublicReply(saved);
  }

  async softDelete(id: number, userId: number, userRole?: string): Promise<void> {
    const reply = await this.replyRepository.findOne({
      where: { id },
    });

    if (!reply) {
      throw new NotFoundException('Reply not found');
    }

    const canDeleteAny = userRole === 'admin' || userRole === 'moderator';
    if (reply.user_id !== userId && !canDeleteAny) {
      throw new ForbiddenException('You can only delete your own replies');
    }

    const wasPublished = reply.status === REPLY_STATUS.published;
    // Soft delete
    reply.status = REPLY_STATUS.deleted;
    reply.deleted_at = new Date();

    await this.replyRepository.save(reply);
    if (wasPublished) {
      await this.postActivityService.recalculatePostActivity(reply.post_id).catch((error) => console.warn('Deleted reply activity update failed:', error.message));
    }
    await this.invalidatePostCache(reply.post_id).catch((error) => console.warn('Deleted reply cache invalidation failed:', error.message));
  }

  private async assertParentVisible(post: Post, viewer?: PostViewer): Promise<void> {
    if (this.postsService) return this.postsService.assertPostVisible(post, viewer);
    // Embedders without PostsService fail closed for resource discussions and the group wall.
    // Resource discussion visibility also depends on the current parent resource;
    // without the shared visibility policy this path cannot prove that relationship.
    if (post.post_type === 'resource_discussion') throw new NotFoundException('Post not found');
    const staff = ['admin', 'moderator'].includes(viewer?.role || '');
    if (post.status !== 'published' && !staff && post.user_id !== viewer?.id) throw new NotFoundException('Post not found');
    if (post.required_group_id && !staff) throw new ForbiddenException('需要加入该组才能查看此帖子');
  }

  private async invalidatePostCache(postId: number): Promise<void> {
    await this.redisService.del(`post:${postId}`);
    await this.redisService.del(`post:detail:v6:${postId}`);
    await this.redisService.del(`post_view:${postId}`);
  }

  private async saveReplyWithAttachments(reply: Reply, document: Record<string, any>, userId: number, enqueuePublished = false, mentionUserIds?: number[] | null): Promise<Reply> {
    if (!this.dataSource) return this.replyRepository.save(reply);
    return this.dataSource.transaction(async (manager: EntityManager) => {
      const saved = await manager.save(Reply, reply);
      let finalDocument = document;
      if (this.attachmentsService) {
        const tokens = collectDraftAttachmentTokens(document);
        if (tokens.length) {
          const bound = await this.attachmentsService.bindDraftsInTransaction(manager, tokens, userId, { type: 'reply', id: saved.id });
          finalDocument = replaceDraftAttachmentTokens(document, bound);
          const contentSource = resolveContentSource(undefined, finalDocument, 2);
          await manager.update(Reply, saved.id, {
            content: contentSource.content,
            content_html: contentSource.content_html,
            content_json: contentSource.content_json as any,
            content_text: contentSource.content_text,
            content_schema_version: contentSource.content_schema_version,
          });
          Object.assign(saved, contentSource);
        }
        await this.attachmentsService.assertDocumentAttachmentsInTransaction(manager, finalDocument, { type: 'reply', id: saved.id });
      } else if (collectDraftAttachmentTokens(document).length) {
        throw new BadRequestException({ code: 'ATTACHMENT_DRAFT_UNAVAILABLE' });
      }
      if (enqueuePublished && saved.status === REPLY_STATUS.published && this.events) {
        await this.events.publish({ eventKey: 'ForumReplyPublished', aggregateType: 'Reply', aggregateId: saved.id, payload: { reply_id: saved.id, mention_user_ids: mentionUserIds } }, manager);
      }
      return saved;
    });
  }

  private async canonicalizeMentionSnapshots(document: unknown): Promise<void> {
    if (!document || typeof document !== 'object') return;
    const ids = collectTiptapMentionIds(document);
    if (!ids.length) return;
    const users = await this.userRepository.find({ where: ids.map((id) => ({ id })), select: { id: true, username: true } });
    const byId = new Map(users.map((user) => [user.id, user.username]));
    for (const id of ids) if (!byId.has(id)) throw new BadRequestException({ code: 'INVALID_MENTION_USER', details: { userId: id } });
    const visit = (node: Record<string, any>) => {
      if (node.type === 'mention') node.attrs.username = byId.get(Number(node.attrs.userId));
      for (const child of node.content || []) visit(child);
    };
    visit(document as Record<string, any>);
  }
}
