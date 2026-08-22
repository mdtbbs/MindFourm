import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  DataSource,
  EntityManager,
  Brackets,
  In,
  IsNull,
  LessThan,
  MoreThan,
  Like,
} from 'typeorm';
import { Post } from '@entities/post.entity';
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
import { PostDetailDto, PostDetailReply, PostDetailService } from './post-detail.service';
import { PostSummaryDto, PostSummaryService } from './post-summary.service';
import { parseMarkdown } from '@common/utils/markdown.util';
import { encodeCursor, decodeCursor } from '@common/utils/cursor.util';
import { escapeLike } from '@common/utils/search.util';
import {
  MAX_REPLY_DEPTH,
  NOTIFICATION_TYPES,
  REPLY_STATUS,
  VISIBLE_REPLY_STATUSES,
} from '@common/utils/constants';
import { generateSlug, makeUniqueSlug } from '@common/utils/url-slug.util';
import { PostActor, isStaffActor } from './post-actor.util';
import { ContentSafetyService } from '../content-safety/content-safety.service';

@Injectable()
export class PostsService {
  // v4: the cached payload gained author display fields (`author_name` /
  // `author_avatar_url`) for posts and replies. Reusing v3 would serve ID-only
  // author data until the old 5-minute entries expired.
  private static readonly POST_DETAIL_CACHE_PREFIX = 'post:detail:v4:';

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
  ) {}

  /**
   * Create a new post with tags in a transaction
   */
  async create(
    dto: CreatePostDto,
    userId: number,
    provenance: { ipAddress?: string; locationLabel?: string | null } = {},
  ): Promise<Post | null> {
    // Execute "before" hook to allow plugins to modify input
    let modifiedDto = await this.eventBus.execute('post.create', { ...dto, userId });
    dto = modifiedDto;

    // Parse markdown to HTML
    const contentHtml = parseMarkdown(dto.content);

    // Resolved up front: this reads the settings table (and its cache) through a
    // different repository and contributes nothing to the write below, so it has no
    // business holding the write transaction open.
    const requestedStatus = dto.status || 'published';
    const risk = this.contentSafety
      ? await this.contentSafety.assess(`${dto.title}\n${dto.content}`)
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
        category_id: dto.category_id,
        server_id: dto.server_id,
        required_group_id: dto.required_group_id,
        post_type: dto.post_type || 'normal',
        title: dto.title,
        slug: await this.resolveUniquePostSlug(manager, dto.title),
        content: dto.content,
        content_html: contentHtml,
        status: requiresApproval ? 'pending' : requestedStatus,
        is_pinned: 0,
        view_count: 0,
        like_count: 0,
        ip_address: provenance.ipAddress || null,
        location_label: provenance.locationLabel || null,
      });

      const savedPost = await manager.save(newPost);

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

      return { post: result ?? savedPost, authorUsername: author?.username ?? null };
    });

    // Invalidating the cache before the commit let a concurrent reader repopulate
    // it from pre-commit state, where it then survived the full 5-minute TTL.
    await this.invalidatePostCache(post.id);
    if (this.contentSafety) {
      await this.contentSafety.recordFlag({ userId, targetType: 'post', targetId: post.id, risk, ipAddress: provenance.ipAddress }).catch(() => undefined);
    }

    // Award points for creating post
    if (post.status === 'published') {
      await this.pointsService.awardPoints(userId, 'create_post', 'post', post.id);
    } else if (post.status === 'pending') {
      this.adminNotificationsService.publishModerationPending({
        item_type: 'post',
        item_id: post.id,
        title: post.title,
        content: dto.content,
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
    if (post.status === 'published' && dto.content) {
      this.notificationsService.notifyMentionedUsers(
        dto.content,
        post.id,
        userId,
        undefined, // replyId - not applicable for posts
        [userId],  // skipUserIds - don't notify the author
      ).catch((err) =>
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
      return cachedPost;
    }

    const post = await this.postRepository.findOne({
      where: { id },
      relations: ['user', 'category'],
      select: {
        id: true,
        user_id: true,
        category_id: true,
        server_id: true,
        post_type: true,
        title: true,
        content: true,
        content_html: true,
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
  private async assertPostVisible(
    post: { status?: string; user_id?: number; required_group_id?: number | null },
    viewer?: { id: number; role: string },
  ): Promise<void> {
    const isStaff = !!viewer && ['admin', 'moderator'].includes(viewer.role);
    const isAuthor = !!viewer && post.user_id === viewer.id;

    if (post.status && post.status !== 'published' && !isStaff && !isAuthor) {
      // 404 rather than 403: existence of unpublished content is itself private.
      throw new NotFoundException('帖子不存在');
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
      status,
      user_id,
      search,
      server_id,
      sort = 'created_at',
      order = 'DESC',
    } = query;

    const skip = (page - 1) * limit;

    const qb = this.postRepository.createQueryBuilder('post')
      .leftJoinAndSelect('post.user', 'user')
      .leftJoinAndSelect('post.category', 'category');

    if (category_id) {
      qb.andWhere('post.category_id = :categoryId', { categoryId: category_id });
    }

    if (user_id) {
      qb.andWhere('post.user_id = :explicitUserId', { explicitUserId: user_id });
    }

    if (server_id) {
      qb.andWhere('post.server_id = :serverId', { serverId: server_id });
    }

    if (search) {
      qb.andWhere('post.title LIKE :search', { search: `%${escapeLike(search)}%` });
    }

    // Status filtering: admins see published + pending; regular users see published + own pending
    if (status) {
      qb.andWhere('post.status = :status', { status });
    } else if (currentUser && ['admin', 'moderator'].includes(currentUser.role)) {
      qb.andWhere('post.status IN (:...visibleStatuses)', { visibleStatuses: ['published', 'pending'] });
    } else if (currentUser) {
      qb.andWhere(
        '(post.status = :publishedStatus OR (post.status = :pendingStatus AND post.user_id = :currentUserId))',
        { publishedStatus: 'published', pendingStatus: 'pending', currentUserId: currentUser.id },
      );
    } else {
      qb.andWhere('post.status = :status', { status: 'published' });
    }

    const sortDirection = order === 'ASC' ? 'ASC' : 'DESC';
    if (sort === 'last_activity_at') {
      qb.orderBy(
        `(SELECT COALESCE(MAX(activity_reply.created_at), post.created_at) FROM replies activity_reply WHERE activity_reply.post_id = post.id AND activity_reply.deleted_at IS NULL AND activity_reply.status IN ('published'))`,
        sortDirection,
      );
    } else {
      const sortField = ['created_at', 'updated_at', 'view_count', 'like_count'].includes(sort) ? sort : 'created_at';
      qb.orderBy(`post.${sortField}`, sortDirection);
    }
    qb.skip(skip).take(limit);

    const [posts, total] = await qb.getManyAndCount();

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
      status,
      user_id,
      server_id,
      cursor,
      sort = 'created_at',
      order = 'DESC',
    } = query;

    const qb = this.postRepository.createQueryBuilder('post')
      .leftJoinAndSelect('post.user', 'user')
      .leftJoinAndSelect('post.category', 'category');

    if (category_id) {
      qb.andWhere('post.category_id = :categoryId', { categoryId: category_id });
    }

    if (user_id) {
      qb.andWhere('post.user_id = :explicitUserId', { explicitUserId: user_id });
    }

    if (server_id) {
      qb.andWhere('post.server_id = :serverId', { serverId: server_id });
    }

    // Status filtering: admins see published + pending; regular users see published + own pending
    if (status) {
      qb.andWhere('post.status = :status', { status });
    } else if (currentUser && ['admin', 'moderator'].includes(currentUser.role)) {
      qb.andWhere('post.status IN (:...visibleStatuses)', { visibleStatuses: ['published', 'pending'] });
    } else if (currentUser) {
      qb.andWhere(
        '(post.status = :publishedStatus OR (post.status = :pendingStatus AND post.user_id = :currentUserId))',
        { publishedStatus: 'published', pendingStatus: 'pending', currentUserId: currentUser.id },
      );
    } else {
      qb.andWhere('post.status = :status', { status: 'published' });
    }

    // Decode cursor for pagination
    if (cursor) {
      try {
        const decoded = decodeCursor(cursor);
        const cursorValue =
          sort === 'created_at' ? new Date(parseInt(decoded[0])) : parseInt(decoded[0]);
        const idValue = parseInt(decoded[1]);
        const sortField = ['created_at', 'updated_at', 'view_count', 'like_count'].includes(sort) ? sort : 'created_at';

        if (order === 'DESC') {
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
        // Invalid cursor, ignore
      }
    }

    const sortField = ['created_at', 'updated_at', 'view_count', 'like_count'].includes(sort) ? sort : 'created_at';
    qb.orderBy(`post.${sortField}`, order === 'ASC' ? 'ASC' : 'DESC')
      .addOrderBy('post.id', order === 'ASC' ? 'ASC' : 'DESC')
      .take(limit + 1);

    const posts = await qb.getMany();

    const hasMore = posts.length > limit;
    if (hasMore) {
      posts.pop(); // Remove the extra item
    }

    // Generate next cursor
    let nextCursor: string | null = null;
    if (hasMore && posts.length > 0) {
      const lastPost = posts[posts.length - 1];
      const cursorValue =
        sort === 'created_at'
          ? lastPost.created_at.getTime().toString()
          : lastPost[sort].toString();
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

    const result = await this.dataSource.transaction(async (manager) => {
      // Find existing post
      const post = await manager.findOne(Post, {
        where: { id },
        relations: ['user'],
      });

      if (!post) {
        throw new NotFoundException('帖子不存在');
      }

      // Check ownership or admin/moderator permission
      const isOwner = post.user_id === userId;
      const canEditAny = userRole === 'admin' || userRole === 'moderator';

      if (!isOwner && !canEditAny) {
        throw new ForbiddenException('无权限编辑此帖子');
      }

      // Parse markdown if content changed
      let contentHtml = post.content_html;
      if (dto.content) {
        contentHtml = parseMarkdown(dto.content);
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

      if (dto.title) {
        updateData.title = dto.title;
        // Keep the slug in step with the title so the canonical URL keeps matching
        // the content. The id stays the real key, so changing this breaks no links —
        // the post route redirects a stale slug to the current one.
        if (dto.title !== post.title) {
          updateData.slug = await this.resolveUniquePostSlug(manager, dto.title);
        }
      }
      if (dto.content) updateData.content = dto.content;
      if (dto.content !== undefined) updateData.content_html = contentHtml;
      if (dto.category_id !== undefined) updateData.category_id = dto.category_id;
      if (dto.server_id !== undefined) updateData.server_id = dto.server_id;
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

      // Re-attach tags if provided
      if (dto.tags) {
        // Remove existing tags
        await manager.delete(PostTag, { post_id: id });
        // Add new tags
        if (dto.tags.length > 0) {
          await this.attachTags(manager, id, dto.tags);
        }
      }

      // Return updated post
      return manager.findOne(Post, {
        where: { id },
        relations: ['user', 'category', 'postTags', 'postTags.tag'],
      });
    });

    // After the commit, for the same reason as in `create`: invalidating first lets
    // a concurrent reader re-cache the pre-update row for the whole TTL.
    await this.invalidatePostCache(id);

    // Execute "after" hook
    this.eventBus.execute('post.updated', { post: result, userId }).catch((err) =>
      console.error('post.updated hook error:', err),
    );

    return result;
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

  /**
   * One page of reply threads.
   *
   * Pagination applies to root replies, and every descendant of the roots on this page
   * is returned alongside them. Paginating the flat list — which is what this used to do
   * — split threads across page boundaries, so a nested reply could land on a page
   * without its parent and the client had no way to reconstruct the conversation.
   *
   * `total` remains the count of *all* replies because the UI presents it as "回复 (N)".
   * `rootTotal` is what the page count is derived from.
   */
  async getReplies(postId: number, limit: number = 20, page: number = 1): Promise<{
    data: PostDetailReply[];
    total: number;
    rootTotal: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const skip = (page - 1) * limit;
    const visible = In(VISIBLE_REPLY_STATUSES);
    const select = {
      id: true,
      post_id: true,
      user_id: true,
      parent_reply_id: true,
      content: true,
      content_html: true,
      status: true,
      like_count: true,
      created_at: true,
      updated_at: true,
      user: {
        id: true,
        mindauth_id: true,
        username: true,
        avatar_url: true,
        role: true,
      },
    } as const;

    const [roots, rootTotal] = await this.replyRepository.findAndCount({
      where: { post_id: postId, parent_reply_id: IsNull(), status: visible },
      relations: ['user'],
      select,
      order: { created_at: 'ASC' },
      skip,
      take: limit,
    });

    // Descend one level per query. Bounded by MAX_REPLY_DEPTH so a parent cycle
    // introduced by bad data cannot turn this into an unbounded loop.
    const descendants: Reply[] = [];
    let frontier = roots.map((reply) => reply.id);
    for (let depth = 1; depth < MAX_REPLY_DEPTH && frontier.length > 0; depth += 1) {
      const level = await this.replyRepository.find({
        where: { post_id: postId, parent_reply_id: In(frontier), status: visible },
        relations: ['user'],
        select,
        order: { created_at: 'ASC' },
      });
      if (level.length === 0) break;
      descendants.push(...level);
      frontier = level.map((reply) => reply.id);
    }

    const total = await this.replyRepository.count({
      where: { post_id: postId, status: visible },
    });

    const data = await this.postDetailService.toReplies([...roots, ...descendants]);

    return {
      data,
      total,
      rootTotal,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(rootTotal / limit)),
    };
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
    const posts = await this.postRepository.find({
      where: [
        { title: Like(`%${escapeLike(query)}%`), status: 'published' },
        { content: Like(`%${escapeLike(query)}%`), status: 'published' },
      ],
      relations: ['user', 'category'],
      select: {
        id: true,
        user_id: true,
        category_id: true,
        server_id: true,
        post_type: true,
        title: true,
        content: true,
        status: true,
        is_pinned: true,
        view_count: true,
        like_count: true,
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
        },
      },
      take: limit,
      order: { created_at: 'DESC' },
    });

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
    const skip = (page - 1) * limit;

    const [posts, total] = await this.postRepository.findAndCount({
      where: { user_id: userId, status: 'published' },
      relations: ['user', 'category'],
      select: {
        id: true,
        user_id: true,
        category_id: true,
        server_id: true,
        post_type: true,
        title: true,
        content: true,
        status: true,
        is_pinned: true,
        view_count: true,
        like_count: true,
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
        },
      },
      order: { created_at: 'DESC' },
      skip,
      take: limit,
    });

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

    const posts = await this.postRepository.find({
      where: {
        status: 'published',
        created_at: MoreThan(yesterday),
      },
      relations: ['user', 'category'],
      select: {
        id: true,
        user_id: true,
        category_id: true,
        server_id: true,
        post_type: true,
        title: true,
        content: true,
        status: true,
        is_pinned: true,
        view_count: true,
        like_count: true,
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
        },
      },
      order: { view_count: 'DESC' },
      take: limit,
    });

    return this.postSummaryService.toSummaryList(posts);
  }

  /**
   * Get pinned posts in a category
   */
  async getPinned(categoryId?: number): Promise<PostSummaryDto[]> {
    const where: any = { is_pinned: 1, status: 'published' };

    if (categoryId) {
      where.category_id = categoryId;
    }

    const posts = await this.postRepository.find({
      where,
      relations: ['user', 'category'],
      select: {
        id: true,
        user_id: true,
        category_id: true,
        server_id: true,
        post_type: true,
        title: true,
        content: true,
        status: true,
        is_pinned: true,
        view_count: true,
        like_count: true,
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
        },
      },
      order: { created_at: 'DESC' },
    });

    return this.postSummaryService.toSummaryList(posts);
  }
}
