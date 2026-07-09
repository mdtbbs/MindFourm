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
  Brackets,
  In,
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

@Injectable()
export class PostsService {
  private static readonly POST_DETAIL_CACHE_PREFIX = 'post:detail:v2:';

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
  ) {}

  /**
   * Create a new post with tags in a transaction
   */
  async create(dto: CreatePostDto, userId: number): Promise<Post | null> {
    // Execute "before" hook to allow plugins to modify input
    let modifiedDto = await this.eventBus.execute('post.create', { ...dto, userId });
    dto = modifiedDto;

    return this.dataSource.transaction(async (manager) => {
      // Parse markdown to HTML
      const contentHtml = parseMarkdown(dto.content);

      // Validate category if provided
      if (dto.category_id) {
        const category = await manager.findOne(Category, {
          where: { id: dto.category_id },
        });
        if (!category) {
          throw new BadRequestException('分类不存在');
        }
      }

      const requestedStatus = dto.status || 'published';
      const requiresApproval = requestedStatus === 'published'
        && await this.settingsService.getBoolean('require_post_approval', true);

      // Create the post
      const newPost = manager.create(Post, {
        user_id: userId,
        category_id: dto.category_id,
        server_id: dto.server_id,
        required_group_id: dto.required_group_id,
        post_type: dto.post_type || 'normal',
        title: dto.title,
        content: dto.content,
        content_html: contentHtml,
        status: requiresApproval ? 'pending' : requestedStatus,
        is_pinned: 0,
        view_count: 0,
        like_count: 0,
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

      // Invalidate cache
      await this.invalidatePostCache(savedPost.id);

      // Award points for creating post
      if (savedPost.status === 'published') {
        await this.pointsService.awardPoints(userId, 'create_post', 'post', savedPost.id);
      } else if (savedPost.status === 'pending') {
        const author = await manager.findOne(User, {
          where: { id: userId },
          select: { username: true },
        });

        this.adminNotificationsService.publishModerationPending({
          item_type: 'post',
          item_id: savedPost.id,
          title: savedPost.title,
          content: dto.content,
          author_username: author?.username || `#${userId}`,
          action_url: '/admin/content/moderation?type=posts',
        }).catch((err) =>
          console.error('Admin post moderation notification error:', err),
        );
      }

      // Execute "after" hook for plugins
      this.eventBus.execute('post.created', { post: savedPost, userId }).catch((err) =>
        console.error('post.created hook error:', err),
      );

      // Handle @mentions in post content (only for published posts)
      if (savedPost.status === 'published' && dto.content) {
        this.notificationsService.notifyMentionedUsers(
          dto.content,
          savedPost.id,
          userId,
          undefined, // replyId - not applicable for posts
          [userId],  // skipUserIds - don't notify the author
        ).catch((err) =>
          console.error('Post mention notification error:', err),
        );
      }

      return result;
    });
  }

  /**
   * Find post by ID with details, increment view count
   * Optional userId for group permission check
   */
  async findById(id: number, userId?: number): Promise<PostDetailDto> {
    const cacheKey = `${PostsService.POST_DETAIL_CACHE_PREFIX}${id}`;

    // Try cache first (without incrementing view count)
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      const cachedPost = JSON.parse(cached);
      // Check group permission if userId provided
      if (userId && cachedPost.required_group_id) {
        const isMember = await this.groupsService.checkMembership(cachedPost.required_group_id, userId);
        if (!isMember) {
          throw new ForbiddenException('需要加入该组才能查看此帖子');
        }
      }
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
        view_count: true,
        like_count: true,
        required_group_id: true,
        created_at: true,
        updated_at: true,
        user: {
          id: true,
          mindauth_id: true,
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

    // Check group permission
    if (userId && post.required_group_id) {
      const isMember = await this.groupsService.checkMembership(post.required_group_id, userId);
      if (!isMember) {
        throw new ForbiddenException('需要加入该组才能查看此帖子');
      }
    }

    // Increment view count
    await this.incrementViewCount(id);

    const detail = await this.postDetailService.toDetail(post);

    // Cache for 5 minutes
    await this.redisService.set(cacheKey, JSON.stringify(detail), 300);

    return detail;
  }

  /**
   * Find posts with page-based pagination
   */
  async findAll(query: QueryPostsDto): Promise<{
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

    const where: any = {};

    if (category_id) {
      where.category_id = category_id;
    }

    if (status) {
      where.status = status;
    } else {
      // Default to published posts
      where.status = 'published';
    }

    if (user_id) {
      where.user_id = user_id;
    }

    if (server_id) {
      where.server_id = server_id;
    }

    if (search) {
      where.title = Like(`%${escapeLike(search)}%`);
    }

    const [posts, total] = await this.postRepository.findAndCount({
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
          role: true,
        },
        category: {
          id: true,
          name: true,
          slug: true,
        },
      },
      order: {
        [sort]: order === 'ASC' ? 'ASC' : 'DESC',
      },
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
   * Find posts with cursor-based pagination
   */
  async findAllCursor(query: QueryPostsDto): Promise<{
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

    const where: any = {};

    if (category_id) {
      where.category_id = category_id;
    }

    if (status) {
      where.status = status;
    } else {
      where.status = 'published';
    }

    if (user_id) {
      where.user_id = user_id;
    }

    if (server_id) {
      where.server_id = server_id;
    }

    // Decode cursor for pagination
    let cursorCondition: any = {};
    if (cursor) {
      try {
        const decoded = decodeCursor(cursor);
        const cursorValue =
          sort === 'created_at' ? new Date(parseInt(decoded[0])) : parseInt(decoded[0]);
        const idValue = parseInt(decoded[1]);

        if (order === 'DESC') {
          cursorCondition = [
            { [sort]: LessThan(cursorValue) },
            { [sort]: cursorValue, id: LessThan(idValue) },
          ];
        } else {
          cursorCondition = [
            { [sort]: MoreThan(cursorValue) },
            { [sort]: cursorValue, id: MoreThan(idValue) },
          ];
        }
      } catch (e) {
        // Invalid cursor, ignore
      }
    }

    const posts = await this.postRepository.find({
      where: cursorCondition.length > 0
        ? [{ ...where, ...cursorCondition[0] }, { ...where, ...cursorCondition[1] }]
        : where,
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
          role: true,
        },
        category: {
          id: true,
          name: true,
          slug: true,
        },
      },
      order: {
        [sort]: order === 'ASC' ? 'ASC' : 'DESC',
        id: order === 'ASC' ? 'ASC' : 'DESC',
      },
      take: limit + 1, // Fetch one extra to check hasMore
    });

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
   * Update a post with optional tag re-attachment in a transaction
   */
  async update(id: number, dto: UpdatePostDto, userId: number, userRole: string): Promise<Post | null> {
    // Execute "before" hook
    const hookCtx = await this.eventBus.execute('post.update', { id, dto, userId, userRole });
    dto = hookCtx.dto;

    return this.dataSource.transaction(async (manager) => {
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

      if (dto.title) updateData.title = dto.title;
      if (dto.content) updateData.content = dto.content;
      if (dto.content !== undefined) updateData.content_html = contentHtml;
      if (dto.category_id !== undefined) updateData.category_id = dto.category_id;
      if (dto.server_id !== undefined) updateData.server_id = dto.server_id;
      if (dto.required_group_id !== undefined) updateData.required_group_id = dto.required_group_id;
      if (dto.post_type) updateData.post_type = dto.post_type;
      if (dto.status) updateData.status = dto.status;
      if (dto.is_pinned !== undefined) updateData.is_pinned = dto.is_pinned;

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
      const result = await manager.findOne(Post, {
        where: { id },
        relations: ['user', 'category', 'postTags', 'postTags.tag'],
      });

      // Invalidate cache
      await this.invalidatePostCache(id);

      // Execute "after" hook
      this.eventBus.execute('post.updated', { post: result, userId }).catch((err) =>
        console.error('post.updated hook error:', err),
      );

      return result;
    });
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
      where: { post_id: postId, status: 'active' },
    });
  }

  /**
   * Get first page of replies for a post
   */
  async getReplies(postId: number, limit: number = 20, page: number = 1): Promise<{
    data: PostDetailReply[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const skip = (page - 1) * limit;

    const [replies, total] = await this.replyRepository.findAndCount({
      where: { post_id: postId, status: In(['active', 'published']) },
      relations: ['user'],
      select: {
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
          role: true,
        },
      },
      order: { created_at: 'ASC' },
      skip,
      take: limit,
    });

    const totalPages = Math.ceil(total / limit);

    const data = await this.postDetailService.toReplies(replies);

    return {
      data,
      total,
      page,
      limit,
      totalPages,
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
        // Create slug from name
        const slug = tagName.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
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
  async search(query: string, limit: number = 20): Promise<Post[]> {
    return this.postRepository.find({
      where: [
        { title: Like(`%${escapeLike(query)}%`), status: 'published' },
        { content: Like(`%${escapeLike(query)}%`), status: 'published' },
      ],
      relations: ['user', 'category'],
      take: limit,
      order: { created_at: 'DESC' },
    });
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
  async getTrending(limit: number = 10): Promise<Post[]> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    return this.postRepository.find({
      where: {
        status: 'published',
        created_at: MoreThan(yesterday),
      },
      relations: ['user', 'category'],
      order: { view_count: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get pinned posts in a category
   */
  async getPinned(categoryId?: number): Promise<Post[]> {
    const where: any = { is_pinned: 1, status: 'published' };

    if (categoryId) {
      where.category_id = categoryId;
    }

    return this.postRepository.find({
      where,
      relations: ['user', 'category'],
      order: { created_at: 'DESC' },
    });
  }
}
