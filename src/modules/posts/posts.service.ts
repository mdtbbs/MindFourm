import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  DataSource,
  EntityManager,
  Brackets,
  In,
  IsNull,
  Like,
} from 'typeorm';
import { Post, type PostSource } from '@entities/post.entity';
import { ContentRelation } from '@entities/content-relation.entity';
import { User } from '@entities/user.entity';
import { Category } from '@entities/category.entity';
import { Tag } from '@entities/tag.entity';
import { PostTag } from '@entities/post-tag.entity';
import { Reply } from '@entities/reply.entity';
import { PostRevision } from '@entities/post-revision.entity';
import { RedisService } from '../../database/redis.service';
import { PointsService } from '../points/points.service';
import { GroupsService } from '../groups/groups.service';
import { EventBusService } from '../plugins/event-bus.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AdminNotificationsService } from '../admin-notifications/admin-notifications.service';
import { SettingsService } from '../settings/settings.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { QueryPostsDto } from './dto/query-posts.dto';
import { PostDetailDto, PostDetailService } from './post-detail.service';
import { PostSummaryDto, PostSummaryService } from './post-summary.service';
import { collectDraftAttachmentTokens, collectTiptapMentionIds, replaceDraftAttachmentTokens, resolveContentSource } from '@common/utils/tiptap-content.util';
import { encodeCursor, decodeCursor } from '@common/utils/cursor.util';
import { selectPostCards, hydratePostCardExcerpts } from '@common/utils/post-card-query.util';
import { applyPostVisibility } from '@common/utils/post-visibility.util';
import { escapeLike } from '@common/utils/search.util';
import {
  NOTIFICATION_TYPES,
  REPLY_STATUS,
  VISIBLE_REPLY_STATUSES,
} from '@common/utils/constants';
import { generateSlug, makeUniqueSlug } from '@common/utils/url-slug.util';
import { PostActor, isStaffActor } from './post-actor.util';
import { ContentSafetyService } from '../content-safety/content-safety.service';
import { normalizePostTitle } from '@common/utils/post-title.util';
import { CustomEmojisService } from '../custom-emojis/custom-emojis.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { EventsService } from '../events/events.service';
import { OutboxEvent } from '@entities/outbox-event.entity';

@Injectable()
export class PostsService {
  // v5: category presentation metadata joined the detail payload. Reusing v4
  // would leave breadcrumbs without the board colour until cache expiry.
  private static readonly POST_DETAIL_CACHE_PREFIX = 'post:detail:v6:';

  constructor(
    @InjectRepository(Post)
    private postRepository: Repository<Post>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Category)
    private categoryRepository: Repository<Category>,
    @InjectRepository(Tag)
    private tagRepository: Repository<Tag>,
    @InjectRepository(PostTag)
    private postTagRepository: Repository<PostTag>,
    @InjectRepository(Reply)
    private replyRepository: Repository<Reply>,
    private dataSource: DataSource,
    private redisService: RedisService,
    private pointsService: PointsService,
    private groupsService: GroupsService,
    private eventBus: EventBusService,
    private notificationsService: NotificationsService,
    private adminNotificationsService: AdminNotificationsService,
    private settingsService: SettingsService,
    private postSummaryService: PostSummaryService,
    private postDetailService: PostDetailService,
    private contentSafety?: ContentSafetyService,
    @Optional() private customEmojis?: CustomEmojisService,
    @Optional() private attachmentsService?: AttachmentsService,
    @Optional() private events?: EventsService,
  ) {}

  onModuleInit(): void {
    this.events?.register('ForumPostPublished', async event => this.deliverPublishedPostEffects(event));
    this.events?.register('ForumPostMentionsAdded', async event => this.deliverPostMentionEffects(event));
  }

  private async deliverPublishedPostEffects(event: OutboxEvent): Promise<void> {
    const post = await this.postRepository.findOne({ where: { id: event.aggregate_id }, select: {
      id: true, user_id: true, status: true, source: true, content: true, content_json: true,
    } });
    if (!post || post.status !== 'published') return;
    if (post.source === 'USER') await this.pointsService.awardPoints(post.user_id, 'create_post', 'post', post.id, true);
    const scope = `post-published:${post.id}`;
    const storedMentionIds = post.content_json ? collectTiptapMentionIds(post.content_json) : [];
    const ids = event.payload_json.mention_user_ids === undefined
      ? (storedMentionIds.length ? storedMentionIds : null)
      : event.payload_json.mention_user_ids;
    if (ids !== null) await this.notificationsService.notifyMentionedUserIds(ids, post.id, post.user_id, post.content, undefined, [post.user_id], true, scope);
    else await this.notificationsService.notifyMentionedUsers(post.content, post.id, post.user_id, undefined, [post.user_id], true, scope);
  }

  private async deliverPostMentionEffects(event: OutboxEvent): Promise<void> {
    const post = await this.postRepository.findOne({ where: { id: event.aggregate_id }, select: { id: true, status: true, content: true } });
    if (!post || post.status !== 'published') return;
    const actorId = Number(event.payload_json.actor_id);
    await this.notificationsService.notifyMentionedUserIds(event.payload_json.mention_user_ids, post.id, actorId, post.content, undefined, [actorId], true, `post-mention-event:${event.id}`);
  }

  private selectPostCards(qb: ReturnType<Repository<Post>['createQueryBuilder']>): void {
    selectPostCards(qb);
  }

  private hydrateCardExcerpts(result: { entities: Post[]; raw: any[] }): Post[] {
    return hydratePostCardExcerpts(result);
  }

  private cardQuery() {
    const qb = this.postRepository.createQueryBuilder('post')
      .leftJoinAndSelect('post.user', 'user').leftJoinAndSelect('post.category', 'category');
    this.selectPostCards(qb);
    return applyPostVisibility(qb, 'post', undefined, 'published');
  }

  /**
   * Create a new post with tags in a transaction
   */
  async create(
    dto: CreatePostDto,
    userId: number,
    provenance: { ipAddress?: string; locationLabel?: string | null; source?: PostSource } = {},
  ): Promise<Post | null> {
    // Execute "before" hook to allow plugins to modify input
    let modifiedDto = await this.eventBus.execute('post.create', { ...dto, userId });
    dto = modifiedDto;
    dto.title = normalizePostTitle(dto.title);
    if (!dto.title) throw new BadRequestException('标题不能为空');

    // JSON is the canonical rich-text source for updated clients. Markdown remains
    // a compatibility projection used by existing services and older clients.
    const richJsonWrite = dto.content_json !== undefined && dto.content_json !== null;
    const canonicalJson = dto.content_json && this.customEmojis
      ? await this.customEmojis.canonicalizeDocument(dto.content_json, dto.content_schema_version || 1, false, true)
      : dto.content_json;
    await this.canonicalizeMentionSnapshots(canonicalJson);
    const contentSource = resolveContentSource(dto.content, canonicalJson, dto.content_schema_version, { allowDraftAttachments: true });
    if (richJsonWrite) await this.assertDocumentQuoteVisibility(contentSource.content_json, await this.viewerFor(userId));
    const content = contentSource.content;
    dto.content = content;
    dto.content_json = contentSource.content_json as unknown as CreatePostDto['content_json'];
    const contentHtml = contentSource.content_html;

    // Resolved up front: this reads the settings table (and its cache) through a
    // different repository and contributes nothing to the write below, so it has no
    // business holding the write transaction open.
    const requestedStatus = dto.status || 'published';
    const risk = this.contentSafety
      ? await this.contentSafety.assess(`${dto.title}\n${content}`, { actorId: userId, surface: 'post' })
      : { score: 0, rules: [], mustReview: false };
    const requiresApproval = requestedStatus === 'published'
      && (risk.mustReview || await this.settingsService.getBoolean('require_post_approval', true));

    // Only `manager`-bound work belongs in here. Everything with an effect outside
    // this connection — point awards (which open their own transaction), Redis
    // invalidation, notifications, plugin hooks — runs after the commit, so a
    // rollback cannot leave the author paid and the moderators notified for a post
    // that does not exist.
    const { post, authorUsername } = await this.dataSource.transaction(async (manager) => {
      // Validate category if provided
      if (dto.category_id) {
        const category = await manager.findOne(Category, {
          where: { id: dto.category_id },
        });
        if (!category) {
          throw new BadRequestException('分类不存在');
        }
      }

      // Create the post
      const newPost = manager.create(Post, {
        user_id: userId,
        content_language: dto.content_language?.trim() || 'unknown',
        category_id: dto.category_id,
        required_group_id: dto.required_group_id,
        post_type: dto.post_type || 'normal',
        source: provenance.source || 'USER',
        title: dto.title,
        slug: await this.resolveUniquePostSlug(manager, dto.title),
        content,
        content_html: contentHtml,
        content_json: contentSource.content_json,
        content_text: contentSource.content_text,
        content_schema_version: contentSource.content_schema_version,
        status: requiresApproval ? 'pending' : requestedStatus,
        is_pinned: 0,
        view_count: 0,
        like_count: 0,
        last_activity_at: new Date(),
        ip_address: provenance.ipAddress || null,
        location_label: provenance.locationLabel || null,
      });

      const savedPost = await manager.save(newPost);

      let finalContent = contentSource;
      if (this.attachmentsService) {
        const draftTokens = collectDraftAttachmentTokens(contentSource.content_json);
        if (draftTokens.length) {
          const bound = await this.attachmentsService.bindDraftsInTransaction(manager, draftTokens, userId, { type: 'post', id: savedPost.id });
          const document = replaceDraftAttachmentTokens(contentSource.content_json, bound);
          finalContent = resolveContentSource(undefined, document, 2);
        }
        await this.attachmentsService.assertDocumentAttachmentsInTransaction(manager, finalContent.content_json, { type: 'post', id: savedPost.id });
      } else if (collectDraftAttachmentTokens(contentSource.content_json).length) {
        throw new BadRequestException({ code: 'ATTACHMENT_DRAFT_UNAVAILABLE' });
      }
      if (finalContent !== contentSource) {
        await manager.update(Post, savedPost.id, {
          content: finalContent.content,
          content_html: finalContent.content_html,
          content_json: finalContent.content_json as any,
          content_text: finalContent.content_text,
          content_schema_version: finalContent.content_schema_version,
        });
        Object.assign(savedPost, finalContent);
      }

      // Keep the generic content reference synchronized while the legacy
      // server_id API column remains in its compatibility window.
      if (dto.server_id) {
        await manager.insert(ContentRelation, {
          source_type: 'post', source_id: savedPost.id, target_type: 'game_server',
          target_id: String(dto.server_id), relation_type: 'related',
        });
      }

      // Attach tags if provided
      if (dto.tags && dto.tags.length > 0) {
        await this.attachTags(manager, savedPost.id, dto.tags);
      }

      // Return post with relations
      const result = await manager.findOne(Post, {
        where: { id: savedPost.id },
        relations: ['user', 'category', 'postTags', 'postTags.tag'],
      });

      const author = savedPost.status === 'pending'
        ? await manager.findOne(User, {
          where: { id: userId },
          select: { username: true },
        })
        : null;

      if (this.events && savedPost.status === 'published') {
        await this.events.publish({ eventKey: 'ForumPostPublished', aggregateType: 'Post', aggregateId: savedPost.id,
          payload: { post_id: savedPost.id, mention_user_ids: richJsonWrite ? collectTiptapMentionIds(savedPost.content_json) : null },
        }, manager);
      }
      return { post: result ?? savedPost, authorUsername: author?.username ?? null };
    });

    // Invalidating the cache before the commit let a concurrent reader repopulate
    // it from pre-commit state, where it then survived the full 5-minute TTL.
    await this.invalidatePostCache(post.id).catch(error => console.warn('Post cache invalidation failed after commit:', error.message));
    if (this.contentSafety) {
      await this.contentSafety.recordFlag({ userId, targetType: 'post', targetId: post.id, risk, ipAddress: provenance.ipAddress }).catch(() => undefined);
    }

    // Award points for creating post
    if (!this.events && post.status === 'published' && post.source === 'USER') {
      await this.pointsService.awardPoints(userId, 'create_post', 'post', post.id).catch(error => console.warn('Post points failed after commit:', error.message));
    } else if (post.status === 'pending') {
      this.adminNotificationsService.publishModerationPending({
        item_type: 'post',
        item_id: post.id,
        title: post.title,
        content,
        author_username: authorUsername || `#${userId}`,
        action_url: '/admin/content/moderation?type=posts',
      }).catch((err) =>
        console.error('Admin post moderation notification error:', err),
      );
    }

    // Execute "after" hook for plugins
    this.eventBus.execute('post.created', { post, userId }).catch((err) =>
      console.error('post.created hook error:', err),
    );

    // Handle @mentions in post content (only for published posts)
    if (!this.events && post.status === 'published' && content) {
      const notify = richJsonWrite
        ? this.notificationsService.notifyMentionedUserIds(collectTiptapMentionIds(post.content_json), post.id, userId, content, undefined, [userId])
        : this.notificationsService.notifyMentionedUsers(content, post.id, userId, undefined, [userId]);
      notify.catch((err) =>
        console.error('Post mention notification error:', err),
      );
    }

    return post;
  }

  /**
   * Find post by ID with details, increment view count
   * Optional userId for group permission check
   */
  async findById(id: number, viewer?: { id: number; role: string }): Promise<PostDetailDto> {
    const cacheKey = `${PostsService.POST_DETAIL_CACHE_PREFIX}${id}`;

    // Try cache first (without incrementing view count)
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      const cachedPost = JSON.parse(cached);
      await this.assertPostVisible(cachedPost, viewer);
      // Still increment view count in background
      await this.incrementViewCount(id);
      if (cachedPost.post_type === 'resource_discussion') {
        return {
          ...cachedPost,
          resource_header: await this.postDetailService.loadResourceHeader(id, cachedPost.post_type),
        };
      }
      return cachedPost;
    }

    const post = await this.postRepository.findOne({
      where: { id },
      relations: ['user', 'category'],
      select: {
        id: true,
        user_id: true,
        category_id: true,
          post_type: true,
        title: true,
        content: true,
        content_html: true,
        content_json: true,
        content_text: true,
        content_schema_version: true,
        location_label: true,
        status: true,
        is_pinned: true,
        is_locked: true,
        best_reply_id: true,
        edited_at: true,
        view_count: true,
        like_count: true,
        required_group_id: true,
        created_at: true,
        updated_at: true,
        user: {
          id: true,
          mindauth_id: true,
          username: true,
          avatar_url: true,
          role: true,
        },
        category: {
          id: true,
          name: true,
          slug: true,
          color: true,
          icon: true,
        },
      },
    });

    if (!post) {
      throw new NotFoundException('帖子不存在');
    }

    await this.assertPostVisible(post, viewer);

    // Increment view count
    await this.incrementViewCount(id);

    const detail = await this.postDetailService.toDetail(post);

    // Cache for 5 minutes
    await this.redisService.set(cacheKey, JSON.stringify(detail), 300);

    return detail;
  }

  /**
   * Authorize a single-post read.
   *
   * Mirrors the visibility rules `findAll` applies to lists. Previously `findById`
   * applied no status filter at all — so `draft`, `pending` and rejected posts were
   * readable by id — and the group check was wrapped in `if (userId && ...)`, which
   * meant it never ran for the controller (which passed no user) and could be
   * bypassed entirely by logging out.
   */
  async assertPostVisible(
    post: { id?: number; post_type?: string; status?: string; user_id?: number; required_group_id?: number | null },
    viewer?: { id: number; role: string },
  ): Promise<void> {
    const isStaff = !!viewer && ['admin', 'moderator'].includes(viewer.role);
    const isAuthor = !!viewer && post.user_id === viewer.id;

    if (post.status && post.status !== 'published' && !isStaff && !isAuthor) {
      // 404 rather than 403: existence of unpublished content is itself private.
      throw new NotFoundException('帖子不存在');
    }

    if (post.post_type === 'resource_discussion' && !isStaff && !isAuthor) {
      const visibleResource = post.id ? await this.dataSource.query(
        `SELECT resource.id
           FROM resources resource
           LEFT JOIN resource_categories category ON category.id = resource.category_id
          WHERE resource.discussion_thread_id = ?
            AND resource.deleted_at IS NULL
            AND resource.is_public = 1
            AND resource.status IN ('approved', 'published')
            AND (resource.visibility IS NULL OR resource.visibility = 'public')
            AND (resource.category_id IS NULL OR category.is_active = 1)
          LIMIT 1`,
        [post.id],
      ) : [];
      if (!visibleResource?.length) throw new NotFoundException('帖子不存在');
    }

    if (post.required_group_id && !isStaff) {
      if (!viewer) {
        throw new ForbiddenException('需要加入该组才能查看此帖子');
      }
      const isMember = await this.groupsService.checkMembership(post.required_group_id, viewer.id);
      if (!isMember) {
        throw new ForbiddenException('需要加入该组才能查看此帖子');
      }
    }
  }

  /**
   * Find posts with page-based pagination
   */
  async findAll(query: QueryPostsDto, currentUser?: { id: number; role: string }): Promise<{
    data: PostSummaryDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const {
      page = 1,
      limit = 20,
      category_id,
      source,
      exclude_category_ids,
      status,
      user_id,
      search,
      content_language,
      server_id,
      sort = 'created_at',
      order = 'DESC',
    } = query;

    const skip = (page - 1) * limit;

    const qb = this.postRepository.createQueryBuilder('post')
      .leftJoinAndSelect('post.user', 'user')
      .leftJoinAndSelect('post.category', 'category');
    this.selectPostCards(qb);

    if (category_id) {
      qb.andWhere('post.category_id = :categoryId', { categoryId: category_id });
    }

    if (source) {
      qb.andWhere('post.source = :source', { source });
    }

    if (exclude_category_ids?.length) {
      // Keep uncategorised posts in the stream: SQL `NULL NOT IN (...)` is not true.
      qb.andWhere(
        '(post.category_id IS NULL OR post.category_id NOT IN (:...excludedCategoryIds))',
        { excludedCategoryIds: exclude_category_ids },
      );
    }

    if (user_id) {
      qb.andWhere('post.user_id = :explicitUserId', { explicitUserId: user_id });
    }

    if (server_id) {
      qb.innerJoin(ContentRelation, 'serverRelation', "serverRelation.source_type = 'post' AND serverRelation.source_id = post.id AND serverRelation.target_type = 'game_server' AND serverRelation.relation_type = 'related'")
        .andWhere('serverRelation.target_id = :serverId', { serverId: String(server_id) });
    }

    if (search) {
      qb.andWhere('post.title LIKE :search', { search: `%${escapeLike(search)}%` });
    }

    if (content_language?.trim()) {
      qb.andWhere('post.content_language = :contentLanguage', { contentLanguage: content_language.trim() });
    }

    applyPostVisibility(qb, 'post', currentUser, status);

    const sortDirection = order === 'ASC' ? 'ASC' : 'DESC';
    if (sort === 'last_activity_at') {
      qb.orderBy('post.last_activity_at', sortDirection);
    } else {
      const sortField = ['created_at', 'updated_at', 'view_count', 'like_count'].includes(sort) ? sort : 'created_at';
      qb.orderBy(`post.${sortField}`, sortDirection);
    }
    qb.addOrderBy('post.id', sortDirection).skip(skip).take(limit);

    const cards = await qb.getRawAndEntities();
    const total = await qb.getCount();
    const posts = this.hydrateCardExcerpts(cards);

    const data = await this.postSummaryService.toSummaryList(posts);
    const totalPages = Math.ceil(total / limit);

    return {
      data,
      total,
      page,
      limit,
      totalPages,
    };
  }

  /**
   * Find posts with cursor-based pagination
   */
  async findAllCursor(query: QueryPostsDto, currentUser?: { id: number; role: string }): Promise<{
    data: PostSummaryDto[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const {
      limit = 20,
      category_id,
      source,
      exclude_category_ids,
      status,
      user_id,
      content_language,
      server_id,
      cursor,
      sort = 'created_at',
      order = 'DESC',
    } = query;

    const qb = this.postRepository.createQueryBuilder('post')
      .leftJoinAndSelect('post.user', 'user')
      .leftJoinAndSelect('post.category', 'category');
    this.selectPostCards(qb);

    if (category_id) {
      qb.andWhere('post.category_id = :categoryId', { categoryId: category_id });
    }

    if (source) {
      qb.andWhere('post.source = :source', { source });
    }

    if (exclude_category_ids?.length) {
      qb.andWhere(
        '(post.category_id IS NULL OR post.category_id NOT IN (:...excludedCategoryIds))',
        { excludedCategoryIds: exclude_category_ids },
      );
    }

    if (user_id) {
      qb.andWhere('post.user_id = :explicitUserId', { explicitUserId: user_id });
    }

    if (content_language?.trim()) {
      qb.andWhere('post.content_language = :contentLanguage', { contentLanguage: content_language.trim() });
    }

    if (server_id) {
      qb.innerJoin(ContentRelation, 'serverRelation', "serverRelation.source_type = 'post' AND serverRelation.source_id = post.id AND serverRelation.target_type = 'game_server' AND serverRelation.relation_type = 'related'")
        .andWhere('serverRelation.target_id = :serverId', { serverId: String(server_id) });
    }

    applyPostVisibility(qb, 'post', currentUser, status);
    const sortField = ['created_at', 'updated_at', 'last_activity_at', 'view_count', 'like_count'].includes(sort) ? sort : 'created_at';
    const dateSort = ['created_at', 'updated_at', 'last_activity_at'].includes(sortField);
    const sortDirection = order === 'ASC' ? 'ASC' : 'DESC';

    // Decode cursor for pagination
    if (cursor) {
      try {
        const decoded = decodeCursor(cursor);
        if (decoded.length !== 2 || !/^\d+$/.test(decoded[0]) || !/^\d+$/.test(decoded[1])) {
          throw new BadRequestException('无效分页游标');
        }
        const cursorValue =
          dateSort ? new Date(Number(decoded[0])) : Number(decoded[0]);
        const idValue = Number(decoded[1]);
        if (!Number.isSafeInteger(idValue) || idValue < 1 || !Number.isSafeInteger(Number(decoded[0])) || (dateSort && !Number.isFinite((cursorValue as Date).getTime()))) throw new BadRequestException('无效分页游标');

        if (sortDirection === 'DESC') {
          qb.andWhere(
            `(post.${sortField} < :cursorValue OR (post.${sortField} = :cursorValue AND post.id < :cursorId))`,
            { cursorValue, cursorId: idValue },
          );
        } else {
          qb.andWhere(
            `(post.${sortField} > :cursorValue OR (post.${sortField} = :cursorValue AND post.id > :cursorId))`,
            { cursorValue, cursorId: idValue },
          );
        }
      } catch (e) {
        if (e instanceof BadRequestException) throw e;
        throw new BadRequestException('无效分页游标');
      }
    }

    qb.orderBy(`post.${sortField}`, sortDirection)
      .addOrderBy('post.id', sortDirection)
      .take(limit + 1);

    const posts = this.hydrateCardExcerpts(await qb.getRawAndEntities());

    const hasMore = posts.length > limit;
    if (hasMore) {
      posts.pop(); // Remove the extra item
    }

    // Generate next cursor
    let nextCursor: string | null = null;
    if (hasMore && posts.length > 0) {
      const lastPost = posts[posts.length - 1];
      const cursorValue =
        dateSort
          ? new Date(lastPost[sortField]).getTime().toString()
          : String(lastPost[sortField]);
      nextCursor = encodeCursor(cursorValue, lastPost.id.toString());
    }

    const data = await this.postSummaryService.toSummaryList(posts);

    return {
      data,
      nextCursor,
      hasMore,
    };
  }

  /**
   * Decide the status a post edit may move to, or null to leave it unchanged.
   *
   * Staff may set either status directly. An author may only park a post back as a
   * draft or ask to publish one — and asking to publish routes through the same
   * `require_post_approval` gate as creating a post, so it lands in `pending`
   * rather than going live. Anything else (including touching an already-moderated
   * post) is rejected.
   */
  private async resolveStatusTransition(
    currentStatus: string,
    requestedStatus: string,
    isStaff: boolean,
  ): Promise<string | null> {
    if (requestedStatus === currentStatus) {
      return null;
    }

    if (isStaff) {
      return requestedStatus;
    }

    if (requestedStatus === 'draft') {
      // Only an unpublished post can be pulled back to draft by its author.
      if (currentStatus === 'draft' || currentStatus === 'pending') {
        return 'draft';
      }
      throw new ForbiddenException('已发布的帖子无法退回草稿，请联系管理员');
    }

    // requestedStatus === 'published'
    if (currentStatus !== 'draft') {
      throw new ForbiddenException('无权修改此帖子的状态');
    }

    const requiresApproval = await this.settingsService.getBoolean('require_post_approval', true);
    return requiresApproval ? 'pending' : 'published';
  }

  /**
   * Update a post with optional tag re-attachment in a transaction
   */
  async update(id: number, dto: UpdatePostDto, userId: number, userRole: string): Promise<Post | null> {
    // Execute "before" hook. A plugin returning a value without a `dto` property
    // would otherwise leave `dto` undefined and throw on the next line.
    const hookCtx = await this.eventBus.execute('post.update', { id, dto, userId, userRole });
    if (hookCtx?.dto) {
      dto = hookCtx.dto;
    }

    const richJsonWrite = dto.content_json !== undefined && dto.content_json !== null;
    const canonicalJson = dto.content_json && this.customEmojis
      ? await this.customEmojis.canonicalizeDocument(dto.content_json, dto.content_schema_version || 1, false, true)
      : dto.content_json;
    await this.canonicalizeMentionSnapshots(canonicalJson);
    const contentSource = dto.content !== undefined || dto.content_json !== undefined
      ? resolveContentSource(dto.content, canonicalJson, dto.content_schema_version, { allowDraftAttachments: true })
      : null;
    if (contentSource) {
      if (richJsonWrite) await this.assertDocumentQuoteVisibility(contentSource.content_json, { id: userId, role: userRole });
      dto.content = contentSource.content;
      dto.content_json = contentSource.content_json as unknown as UpdatePostDto['content_json'];
    }

    let newlyMentionedUserIds: number[] = [];
    const result = await this.dataSource.transaction(async (manager) => {
      // Find existing post
      const post = await manager.findOne(Post, {
        where: { id },
        relations: ['user'],
      });

      if (!post) {
        throw new NotFoundException('帖子不存在');
      }
      const previousMentionIds = post.content_json ? collectTiptapMentionIds(post.content_json) : [];

      // Check ownership or admin/moderator permission
      const isOwner = post.user_id === userId;
      const canEditAny = userRole === 'admin' || userRole === 'moderator';

      if (!isOwner && !canEditAny) {
        throw new ForbiddenException('无权限编辑此帖子');
      }

      // Validate category if changing
      if (dto.category_id && dto.category_id !== post.category_id) {
        const category = await manager.findOne(Category, {
          where: { id: dto.category_id },
        });
        if (!category) {
          throw new BadRequestException('分类不存在');
        }
      }

      // Update fields
      const updateData: Partial<Post> = {};

      if (dto.title !== undefined) {
        const title = normalizePostTitle(dto.title);
        if (!title) throw new BadRequestException('标题不能为空');
        updateData.title = title;
        // Keep the slug in step with the title so the canonical URL keeps matching
        // the content. The id stays the real key, so changing this breaks no links —
        // the post route redirects a stale slug to the current one.
        if (title !== post.title) {
          updateData.slug = await this.resolveUniquePostSlug(manager, title);
        }
      }
      if (contentSource) {
        let finalContent = contentSource;
        if (this.attachmentsService) {
          const draftTokens = collectDraftAttachmentTokens(contentSource.content_json);
          if (draftTokens.length) {
            const bound = await this.attachmentsService.bindDraftsInTransaction(manager, draftTokens, userId, { type: 'post', id });
            finalContent = resolveContentSource(undefined, replaceDraftAttachmentTokens(contentSource.content_json, bound), 2);
          }
          await this.attachmentsService.assertDocumentAttachmentsInTransaction(manager, finalContent.content_json, { type: 'post', id });
        } else if (collectDraftAttachmentTokens(contentSource.content_json).length) {
          throw new BadRequestException({ code: 'ATTACHMENT_DRAFT_UNAVAILABLE' });
        }
        updateData.content = finalContent.content;
        updateData.content_html = finalContent.content_html;
        updateData.content_json = finalContent.content_json;
        updateData.content_text = finalContent.content_text;
        updateData.content_schema_version = finalContent.content_schema_version;
        if (richJsonWrite) {
          const nextMentionIds = collectTiptapMentionIds(finalContent.content_json);
          newlyMentionedUserIds = nextMentionIds.filter((mentionId) => !previousMentionIds.includes(mentionId));
        }
      }
      if (dto.content_language !== undefined) updateData.content_language = dto.content_language.trim() || 'unknown';
      if (dto.category_id !== undefined) updateData.category_id = dto.category_id;
      if (dto.required_group_id !== undefined) updateData.required_group_id = dto.required_group_id;
      if (dto.post_type) updateData.post_type = dto.post_type;

      if (dto.status) {
        const nextStatus = await this.resolveStatusTransition(post.status, dto.status, canEditAny);
        if (nextStatus) {
          updateData.status = nextStatus;
        }
      }
      // `is_pinned` is not editable here — see UpdatePostDto. Use PUT /api/posts/:id/pin.

      // Snapshot the values being replaced, in this same transaction. Written before
      // the update purely for readability; what matters is that it shares the
      // transaction, because a revision committed against a post update that then
      // rolled back would claim an edit that never happened — and the reverse would
      // silently lose a version of the text.
      //
      // Only a real title/content change counts: re-categorising or re-tagging a post
      // leaves both fields identical, and a revision for that would be a row whose
      // content matches the one before it, padding the history with no-ops.
      const titleChanged = updateData.title !== undefined && updateData.title !== post.title;
      const contentChanged = updateData.content !== undefined && updateData.content !== post.content;

      if (titleChanged || contentChanged) {
        await manager.insert(PostRevision, {
          post_id: id,
          editor_id: userId,
          title: post.title,
          content: post.content,
        });
        updateData.edited_at = new Date();
      }

      await manager.update(Post, id, updateData);

      if (dto.server_id !== undefined) {
        await manager.delete(ContentRelation, {
          source_type: 'post', source_id: id, target_type: 'game_server', relation_type: 'related',
        });
        if (dto.server_id) {
          await manager.insert(ContentRelation, {
            source_type: 'post', source_id: id, target_type: 'game_server',
            target_id: String(dto.server_id), relation_type: 'related',
          });
        }
      }

      // Re-attach tags if provided
      if (dto.tags) {
        // Remove existing tags
        await manager.delete(PostTag, { post_id: id });
        // Add new tags
        if (dto.tags.length > 0) {
          await this.attachTags(manager, id, dto.tags);
        }
      }

      // Store delivery work with the edit so failures after commit cannot turn
      // a successful edit into a 500 and induce a duplicate submission.
      const updatedPost = await manager.findOne(Post, {
        where: { id }, relations: ['user', 'category', 'postTags', 'postTags.tag'],
      });
      if (this.events && updatedPost?.status === 'published') {
        if (post.status !== 'published') {
          await this.events.publish({ eventKey: 'ForumPostPublished', aggregateType: 'Post', aggregateId: id,
            payload: { post_id: id, mention_user_ids: richJsonWrite ? collectTiptapMentionIds(updatedPost.content_json) : null },
          }, manager);
        } else if (newlyMentionedUserIds.length) {
          await this.events.publish({ eventKey: 'ForumPostMentionsAdded', aggregateType: 'Post', aggregateId: id,
            payload: { post_id: id, actor_id: userId, mention_user_ids: newlyMentionedUserIds },
          }, manager);
        }
      }
      return updatedPost;
    });

    // After the commit, for the same reason as in `create`: invalidating first lets
    // a concurrent reader re-cache the pre-update row for the whole TTL.
    await this.invalidatePostCache(id).catch(error => console.warn('Post cache invalidation failed after commit:', error.message));

    if (!this.events && result?.status === 'published' && newlyMentionedUserIds.length) {
      await this.notificationsService.notifyMentionedUserIds(
        newlyMentionedUserIds,
        id,
        userId,
        result.content,
        undefined,
        [userId],
      ).catch(error => console.warn('Post mention delivery failed after commit:', error.message));
    }

    // Execute "after" hook
    this.eventBus.execute('post.updated', { post: result, userId }).catch((err) =>
      console.error('post.updated hook error:', err),
    );

    return result;
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

  private async viewerFor(userId: number): Promise<{ id: number; role: string }> {
    const user = await this.userRepository.findOne({ where: { id: userId }, select: { id: true, role: true } });
    if (!user) throw new NotFoundException('用户不存在');
    return { id: user.id, role: user.role };
  }

  async assertDocumentQuoteVisibility(document: unknown, viewer: { id: number; role: string }): Promise<void> {
    if (!document || typeof document !== 'object') return;
    const targets = new Map<string, { postId: number; replyId?: number }>();
    const visit = (node: Record<string, any>) => {
      if (node.type === 'postQuote') targets.set('p:' + node.attrs.postId, { postId: Number(node.attrs.postId) });
      if (node.type === 'replyQuote') targets.set('r:' + node.attrs.postId + ':' + node.attrs.replyId, { postId: Number(node.attrs.postId), replyId: Number(node.attrs.replyId) });
      for (const child of node.content || []) visit(child);
    };
    visit(document as Record<string, any>);
    for (const target of targets.values()) await this.assertQuoteVisible(target.postId, viewer, target.replyId);
  }

  async assertQuoteVisible(postId: number, viewer?: { id: number; role: string }, replyId?: number): Promise<{ available: true }> {
    const post = await this.postRepository.findOne({
      where: { id: postId },
      select: { id: true, user_id: true, status: true, required_group_id: true },
    });
    if (!post) throw new NotFoundException('引用的内容不可用');
    await this.assertPostVisible(post, viewer);
    if (replyId !== undefined) {
      const reply = await this.replyRepository.findOne({
        where: { id: replyId, post_id: postId },
        select: { id: true, status: true },
      });
      if (!reply || reply.status !== REPLY_STATUS.published) throw new NotFoundException('引用的内容不可用');
    }
    return { available: true };
  }

  /**
   * Soft delete a post
   */
  async softDelete(id: number, userId: number, userRole: string): Promise<void> {
    const post = await this.postRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!post) {
      throw new NotFoundException('帖子不存在');
    }

    // Check ownership or admin/moderator permission
    const isOwner = post.user_id === userId;
    const canDeleteAny = userRole === 'admin' || userRole === 'moderator';

    if (!isOwner && !canDeleteAny) {
      throw new ForbiddenException('无权限删除此帖子');
    }

    // Execute "before" hook
    await this.eventBus.execute('post.delete', { post, userId });

    // Soft delete using TypeORM's soft-remove
    await this.postRepository.softDelete(id);

    // Invalidate cache
    await this.invalidatePostCache(id);

    // Execute "after" hook
    this.eventBus.execute('post.deleted', { post, userId }).catch((err) =>
      console.error('post.deleted hook error:', err),
    );
  }

  /**
   * Permanently delete a post (admin only)
   */
  async hardDelete(id: number): Promise<void> {
    const post = await this.postRepository.findOne({
      where: { id },
    });

    if (!post) {
      throw new NotFoundException('帖子不存在');
    }

    // Remove associated tags
    await this.postTagRepository.delete({ post_id: id });

    // Hard delete
    await this.postRepository.delete(id);

    // Invalidate cache
    await this.invalidatePostCache(id);
  }

  /**
   * Increment view count
   */
  async incrementViewCount(id: number): Promise<void> {
    // Use Redis for rate limiting view count increments
    const cacheKey = `post_view:${id}`;
    const viewed = await this.redisService.get(cacheKey);

    if (!viewed) {
      await this.postRepository.increment({ id }, 'view_count', 1);
      // Set a short TTL to prevent rapid increments
      await this.redisService.set(cacheKey, '1', 60);
    }
  }

  /**
   * Pin or unpin a post
   */
  async pin(id: number, isPinned: number): Promise<Post> {
    await this.postRepository.update(id, { is_pinned: isPinned });

    // Invalidate cache
    await this.invalidatePostCache(id);

    const post = await this.postRepository.findOne({
      where: { id },
      relations: ['user', 'category'],
    });

    if (!post) {
      throw new NotFoundException('帖子不存在');
    }

    return post;
  }

  /**
   * Open or close a post to new replies.
   *
   * The role is re-checked here even though `PUT /api/posts/:id/lock` is already
   * behind `@Roles('moderator', 'admin')`: the guard protects the route, not the
   * method, and this is the only place that decides who may change a lock.
   */
  async setLocked(
    postId: number,
    locked: boolean,
    actor: PostActor,
  ): Promise<{ id: number; is_locked: boolean }> {
    if (!isStaffActor(actor)) {
      throw new ForbiddenException('无权限锁定或解锁帖子');
    }

    const post = await this.postRepository.findOne({
      where: { id: postId },
      select: { id: true },
    });
    if (!post) {
      throw new NotFoundException('帖子不存在');
    }

    await this.postRepository.update(postId, { is_locked: locked ? 1 : 0 });

    // After the write, for the same reason as in `create`: invalidating first lets a
    // concurrent reader re-cache the pre-lock row for the whole TTL, which would keep
    // serving `is_locked: false` while the service is already rejecting replies.
    await this.invalidatePostCache(postId);

    // Just the flag, rather than the reloaded entity that `pin` and `move` return: those
    // are eagerly joined to `user`, so they ship the author's email and notification
    // preferences to the caller. There is nothing here the client needs beyond the new
    // state.
    return { id: postId, is_locked: locked };
  }

  /**
   * Mark one of a post's replies as the accepted answer, or clear the mark.
   *
   * Read and write share a transaction so the reply cannot be deleted between the
   * check that it belongs to this post and the update that points at it.
   */
  async setBestReply(
    postId: number,
    replyId: number | null,
    actor: PostActor,
  ): Promise<{ id: number; best_reply_id: number | null }> {
    const markedReply = await this.dataSource.transaction(async (manager) => {
      const post = await manager.findOne(Post, {
        where: { id: postId },
        select: { id: true, user_id: true, best_reply_id: true },
      });
      if (!post) {
        throw new NotFoundException('帖子不存在');
      }

      // The author picks the answer to their own question; moderators can correct an
      // abandoned or abused thread.
      if (post.user_id !== actor.id && !isStaffActor(actor)) {
        throw new ForbiddenException('只有帖子作者或管理组可以设置最佳答案');
      }

      let reply: Reply | null = null;
      if (replyId !== null) {
        // `post_id` is part of the lookup rather than checked afterwards, so a reply
        // from another thread simply does not resolve — otherwise any visible reply id
        // in the forum could be pinned to any post. The status filter keeps a pending
        // or deleted reply from being promoted to the top of the page.
        reply = await manager.findOne(Reply, {
          where: {
            id: replyId,
            post_id: postId,
            status: In(VISIBLE_REPLY_STATUSES),
          },
          select: { id: true, user_id: true, content: true },
        });
        if (!reply) {
          throw new BadRequestException('该回复不存在或不属于此帖子');
        }
      }

      await manager.update(Post, postId, { best_reply_id: replyId });

      return reply;
    });

    await this.invalidatePostCache(postId);

    // Post-commit and best-effort: the mark is already durable, and failing the
    // request over a notification would tell the caller their change did not apply.
    // Marking your own reply notifies nobody — including an author accepting their own
    // answer, and a moderator accepting one they wrote themselves.
    if (markedReply && markedReply.user_id !== actor.id) {
      this.notificationsService.create({
        user_id: markedReply.user_id,
        type: NOTIFICATION_TYPES.best_answer,
        actor_id: actor.id,
        post_id: postId,
        reply_id: markedReply.id,
        content: markedReply.content,
      }).catch((err) =>
        console.error('best answer notification error:', err),
      );
    }

    return { id: postId, best_reply_id: replyId };
  }

  /**
   * Move a post to a different category
   */
  async move(id: number, categoryId: number): Promise<Post> {
    const category = await this.categoryRepository.findOne({
      where: { id: categoryId },
    });

    if (!category) {
      throw new BadRequestException('分类不存在');
    }

    await this.postRepository.update(id, { category_id: categoryId });

    // Invalidate cache
    await this.invalidatePostCache(id);

    const post = await this.postRepository.findOne({
      where: { id },
      relations: ['user', 'category'],
    });

    if (!post) {
      throw new NotFoundException('帖子不存在');
    }

    return post;
  }

  /**
   * Get reply count for a post
   */
  async getReplyCount(postId: number): Promise<number> {
    return this.replyRepository.count({
      where: { post_id: postId, status: REPLY_STATUS.published },
    });
  }

  /** Root pages have a hard bound; each branch is expanded through its own child page. */
  async getReplies(postId: number, limit = 20, page = 1) {
    const bounded = this.replyPage(limit, page);
    const result = await this.loadReplyPage(postId, null, bounded.limit, bounded.page);
    const total = await this.replyRepository.count({ where: { post_id: postId, status: In(VISIBLE_REPLY_STATUSES) } });
    return { ...result, total, rootTotal: result.total };
  }

  /** The controller authorizes the post before exposing this branch. */
  async getReplyChildren(postId: number, parentReplyId: number, limit = 20, page = 1) {
    const parent = await this.replyRepository.findOne({
      where: { id: parentReplyId, post_id: postId, status: In(VISIBLE_REPLY_STATUSES) }, select: { id: true },
    });
    if (!parent) throw new NotFoundException('回复不存在');
    const bounded = this.replyPage(limit, page);
    return this.loadReplyPage(postId, parentReplyId, bounded.limit, bounded.page);
  }

  private replyPage(limit: number, page: number) {
    return {
      limit: Math.min(50, Math.max(1, Math.trunc(Number(limit)) || 20)),
      page: Math.min(1000000, Math.max(1, Math.trunc(Number(page)) || 1)),
    };
  }

  private async loadReplyPage(postId: number, parentReplyId: number | null, limit: number, page: number) {
    const [rows, total] = await this.replyRepository.findAndCount({
      where: { post_id: postId, parent_reply_id: parentReplyId === null ? IsNull() : parentReplyId, status: In(VISIBLE_REPLY_STATUSES) },
      relations: ['user'],
      select: {
        id: true, post_id: true, user_id: true, parent_reply_id: true, content: true,
        content_html: true, content_json: true, content_schema_version: true, content_text: true,
        status: true, like_count: true, location_label: true, created_at: true, updated_at: true,
        user: { id: true, mindauth_id: true, username: true, avatar_url: true, role: true },
      },
      order: { created_at: 'ASC', id: 'ASC' }, skip: (page - 1) * limit, take: limit,
    });
    const counts = rows.length ? await this.replyRepository.createQueryBuilder('reply')
      .select('reply.parent_reply_id', 'parent_id').addSelect('COUNT(reply.id)', 'count')
      .where('reply.post_id = :postId', { postId })
      .andWhere('reply.parent_reply_id IN (:...ids)', { ids: rows.map(reply => reply.id) })
      .andWhere('reply.status IN (:...statuses)', { statuses: VISIBLE_REPLY_STATUSES })
      .groupBy('reply.parent_reply_id').getRawMany<{ parent_id: number; count: string }>() : [];
    const countMap = new Map(counts.map(row => [Number(row.parent_id), Number(row.count)]));
    const data = (await this.postDetailService.toReplies(rows)).map(reply => ({ ...reply, child_count: countMap.get(reply.id) || 0 }));
    return { data, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }

  /**
   * Attach tags to a post
   */
  private async attachTags(
    manager: any,
    postId: number,
    tagNames: string[],
  ): Promise<void> {
    for (const tagName of tagNames) {
      // Find or create tag
      let tag = await manager.findOne(Tag, {
        where: { name: tagName },
      });

      if (!tag) {
        const slug = await this.resolveUniqueTagSlug(manager, tagName);
        tag = manager.create(Tag, {
          name: tagName,
          slug,
        });
        tag = await manager.save(Tag, tag);
      }

      // Create post-tag relation
      const postTag = manager.create(PostTag, {
        post_id: postId,
        tag_id: tag.id,
      });
      await manager.save(PostTag, postTag);
    }
  }

  /**
   * A keyword-bearing slug for a post title.
   *
   * `posts.slug` existed on the entity but nothing ever assigned it, so it was
   * always null — which meant the sitemap silently degraded every post URL to a bare
   * numeric id with no keywords. Not unique-constrained in the database (the id
   * remains the canonical key), but kept distinct so `/posts/{id}-{slug}` reads
   * unambiguously.
   */
  private async resolveUniquePostSlug(
    manager: EntityManager,
    title: string,
  ): Promise<string | undefined> {
    const baseSlug = generateSlug(title);
    if (!baseSlug) {
      // Leaves the column at its NULL default rather than writing an empty string.
      return undefined;
    }

    const existingCount = await manager.count(Post, {
      where: [{ slug: baseSlug }, { slug: Like(`${baseSlug}-%`) }],
    });

    return makeUniqueSlug(baseSlug, existingCount);
  }

  /**
   * A slug for a new tag that will not collide with an existing one.
   *
   * `tags.slug` is UNIQUE. The previous inline expression stripped every character
   * outside `[\w-]`, and JS `\w` excludes CJK — so any Chinese tag name produced an
   * empty slug, and creating a post with two of them violated the index with an
   * unhandled 500. `generateSlug` preserves CJK; the timestamp fallback covers names
   * that are entirely punctuation and still reduce to nothing.
   */
  private async resolveUniqueTagSlug(
    manager: EntityManager,
    tagName: string,
  ): Promise<string> {
    const baseSlug = generateSlug(tagName) || `tag-${Date.now()}`;

    const existingCount = await manager.count(Tag, {
      where: [{ slug: baseSlug }, { slug: Like(`${baseSlug}-%`) }],
    });

    return makeUniqueSlug(baseSlug, existingCount);
  }

  /**
   * Invalidate post cache
   */
  private async invalidatePostCache(postId: number): Promise<void> {
    await this.redisService.del(`post:${postId}`);
    await this.redisService.del(`${PostsService.POST_DETAIL_CACHE_PREFIX}${postId}`);
    await this.redisService.del(`post_view:${postId}`);
  }

  /**
   * Search posts by title or content
   */
  async search(query: string, limit: number = 20): Promise<PostSummaryDto[]> {
    const qb = this.cardQuery().andWhere("(post.title LIKE :term OR COALESCE(NULLIF(post.content_text, ''), post.content) LIKE :term)", { term: `%${escapeLike(query)}%` })
      .orderBy('post.created_at', 'DESC').addOrderBy('post.id', 'DESC').take(Math.min(50, Math.max(1, limit)));
    const posts = this.hydrateCardExcerpts(await qb.getRawAndEntities());

    return this.postSummaryService.toSummaryList(posts);
  }

  /**
   * Get posts by user with pagination
   */
  async findByUser(
    userId: number,
    page: number = 1,
    limit: number = 20,
  ): Promise<{
    data: PostSummaryDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    limit = Math.min(50, Math.max(1, Math.trunc(Number(limit)) || 20));
    page = Math.max(1, Math.trunc(Number(page)) || 1);
    const skip = (page - 1) * limit;

    const qb = this.cardQuery().andWhere('post.user_id = :userId AND post.source = :source', { userId, source: 'USER' })
      .orderBy('post.created_at', 'DESC').addOrderBy('post.id', 'DESC').skip(skip).take(Math.min(50, Math.max(1, limit)));
    const cards = await qb.getRawAndEntities();
    const total = await qb.getCount();
    const posts = this.hydrateCardExcerpts(cards);

    const data = await this.postSummaryService.toSummaryList(posts);
    const totalPages = Math.ceil(total / limit);

    return {
      data,
      total,
      page,
      limit,
      totalPages,
    };
  }

  /**
   * Get trending posts (most viewed in last 24 hours)
   */
  async getTrending(limit: number = 10): Promise<PostSummaryDto[]> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const qb = this.cardQuery().andWhere('post.created_at > :yesterday', { yesterday })
      .orderBy('post.view_count', 'DESC').addOrderBy('post.id', 'DESC').take(Math.min(50, Math.max(1, limit)));
    const posts = this.hydrateCardExcerpts(await qb.getRawAndEntities());

    return this.postSummaryService.toSummaryList(posts);
  }

  /**
   * Get pinned posts in a category
   */
  async getPinned(categoryId?: number): Promise<PostSummaryDto[]> {
    const qb = this.cardQuery().andWhere('post.is_pinned = :pinned', { pinned: 1 });
    if (categoryId) qb.andWhere('post.category_id = :categoryId', { categoryId });
    qb.orderBy('post.created_at', 'DESC').addOrderBy('post.id', 'DESC').take(50);
    const posts = this.hydrateCardExcerpts(await qb.getRawAndEntities());

    return this.postSummaryService.toSummaryList(posts);
  }
}
