"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const post_entity_1 = require("../../entities/post.entity");
const user_entity_1 = require("../../entities/user.entity");
const category_entity_1 = require("../../entities/category.entity");
const tag_entity_1 = require("../../entities/tag.entity");
const post_tag_entity_1 = require("../../entities/post-tag.entity");
const reply_entity_1 = require("../../entities/reply.entity");
const redis_service_1 = require("../../database/redis.service");
const points_service_1 = require("../points/points.service");
const groups_service_1 = require("../groups/groups.service");
const event_bus_service_1 = require("../plugins/event-bus.service");
const notifications_service_1 = require("../notifications/notifications.service");
const settings_service_1 = require("../settings/settings.service");
const markdown_util_1 = require("../../common/utils/markdown.util");
const cursor_util_1 = require("../../common/utils/cursor.util");
const search_util_1 = require("../../common/utils/search.util");
let PostsService = class PostsService {
    constructor(postRepository, userRepository, categoryRepository, tagRepository, postTagRepository, replyRepository, dataSource, redisService, pointsService, groupsService, eventBus, notificationsService, settingsService) {
        this.postRepository = postRepository;
        this.userRepository = userRepository;
        this.categoryRepository = categoryRepository;
        this.tagRepository = tagRepository;
        this.postTagRepository = postTagRepository;
        this.replyRepository = replyRepository;
        this.dataSource = dataSource;
        this.redisService = redisService;
        this.pointsService = pointsService;
        this.groupsService = groupsService;
        this.eventBus = eventBus;
        this.notificationsService = notificationsService;
        this.settingsService = settingsService;
    }
    async create(dto, userId) {
        let modifiedDto = await this.eventBus.execute('post.create', { ...dto, userId });
        dto = modifiedDto;
        return this.dataSource.transaction(async (manager) => {
            const contentHtml = (0, markdown_util_1.parseMarkdown)(dto.content);
            if (dto.category_id) {
                const category = await manager.findOne(category_entity_1.Category, {
                    where: { id: dto.category_id },
                });
                if (!category) {
                    throw new common_1.BadRequestException('分类不存在');
                }
            }
            const requestedStatus = dto.status || 'published';
            const requiresApproval = requestedStatus === 'published'
                && await this.settingsService.getBoolean('require_post_approval', true);
            const newPost = manager.create(post_entity_1.Post, {
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
            if (dto.tags && dto.tags.length > 0) {
                await this.attachTags(manager, savedPost.id, dto.tags);
            }
            const result = await manager.findOne(post_entity_1.Post, {
                where: { id: savedPost.id },
                relations: ['user', 'category', 'postTags', 'postTags.tag'],
            });
            await this.invalidatePostCache(savedPost.id);
            if (savedPost.status === 'published') {
                await this.pointsService.awardPoints(userId, 'create_post', 'post', savedPost.id);
            }
            this.eventBus.execute('post.created', { post: savedPost, userId }).catch((err) => console.error('post.created hook error:', err));
            if (savedPost.status === 'published' && dto.content) {
                this.notificationsService.notifyMentionedUsers(dto.content, savedPost.id, userId, undefined, [userId]).catch((err) => console.error('Post mention notification error:', err));
            }
            return result;
        });
    }
    async findById(id, userId) {
        const cacheKey = `post:${id}`;
        const cached = await this.redisService.get(cacheKey);
        if (cached) {
            const cachedPost = JSON.parse(cached);
            if (userId && cachedPost.required_group_id) {
                const isMember = await this.groupsService.checkMembership(cachedPost.required_group_id, userId);
                if (!isMember) {
                    throw new common_1.ForbiddenException('需要加入该组才能查看此帖子');
                }
            }
            await this.incrementViewCount(id);
            return cachedPost;
        }
        const post = await this.postRepository.findOne({
            where: { id },
            relations: ['user', 'category', 'postTags', 'postTags.tag', 'requiredGroup'],
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
            },
        });
        if (!post) {
            throw new common_1.NotFoundException('帖子不存在');
        }
        if (userId && post.required_group_id) {
            const isMember = await this.groupsService.checkMembership(post.required_group_id, userId);
            if (!isMember) {
                throw new common_1.ForbiddenException('需要加入该组才能查看此帖子');
            }
        }
        await this.incrementViewCount(id);
        await this.redisService.set(cacheKey, JSON.stringify(post), 300);
        return post;
    }
    async findAll(query) {
        const { page = 1, limit = 20, category_id, status, user_id, search, server_id, sort = 'created_at', order = 'DESC', } = query;
        const skip = (page - 1) * limit;
        const where = {};
        if (category_id) {
            where.category_id = category_id;
        }
        if (status) {
            where.status = status;
        }
        else {
            where.status = 'published';
        }
        if (user_id) {
            where.user_id = user_id;
        }
        if (server_id) {
            where.server_id = server_id;
        }
        if (search) {
            where.title = (0, typeorm_2.Like)(`%${(0, search_util_1.escapeLike)(search)}%`);
        }
        const [data, total] = await this.postRepository.findAndCount({
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
            },
            order: {
                [sort]: order === 'ASC' ? 'ASC' : 'DESC',
            },
            skip,
            take: limit,
        });
        const totalPages = Math.ceil(total / limit);
        return {
            data,
            total,
            page,
            limit,
            totalPages,
        };
    }
    async findAllCursor(query) {
        const { limit = 20, category_id, status, user_id, server_id, cursor, sort = 'created_at', order = 'DESC', } = query;
        const where = {};
        if (category_id) {
            where.category_id = category_id;
        }
        if (status) {
            where.status = status;
        }
        else {
            where.status = 'published';
        }
        if (user_id) {
            where.user_id = user_id;
        }
        if (server_id) {
            where.server_id = server_id;
        }
        let cursorCondition = {};
        if (cursor) {
            try {
                const decoded = (0, cursor_util_1.decodeCursor)(cursor);
                const cursorValue = sort === 'created_at' ? new Date(parseInt(decoded[0])) : parseInt(decoded[0]);
                const idValue = parseInt(decoded[1]);
                if (order === 'DESC') {
                    cursorCondition = [
                        { [sort]: (0, typeorm_2.LessThan)(cursorValue) },
                        { [sort]: cursorValue, id: (0, typeorm_2.LessThan)(idValue) },
                    ];
                }
                else {
                    cursorCondition = [
                        { [sort]: (0, typeorm_2.MoreThan)(cursorValue) },
                        { [sort]: cursorValue, id: (0, typeorm_2.MoreThan)(idValue) },
                    ];
                }
            }
            catch (e) {
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
            },
            order: {
                [sort]: order === 'ASC' ? 'ASC' : 'DESC',
                id: order === 'ASC' ? 'ASC' : 'DESC',
            },
            take: limit + 1,
        });
        const hasMore = posts.length > limit;
        if (hasMore) {
            posts.pop();
        }
        let nextCursor = null;
        if (hasMore && posts.length > 0) {
            const lastPost = posts[posts.length - 1];
            const cursorValue = sort === 'created_at'
                ? lastPost.created_at.getTime().toString()
                : lastPost[sort].toString();
            nextCursor = (0, cursor_util_1.encodeCursor)(cursorValue, lastPost.id.toString());
        }
        return {
            data: posts,
            nextCursor,
            hasMore,
        };
    }
    async update(id, dto, userId, userRole) {
        const hookCtx = await this.eventBus.execute('post.update', { id, dto, userId, userRole });
        dto = hookCtx.dto;
        return this.dataSource.transaction(async (manager) => {
            const post = await manager.findOne(post_entity_1.Post, {
                where: { id },
                relations: ['user'],
            });
            if (!post) {
                throw new common_1.NotFoundException('帖子不存在');
            }
            const isOwner = post.user_id === userId;
            const canEditAny = userRole === 'admin' || userRole === 'moderator';
            if (!isOwner && !canEditAny) {
                throw new common_1.ForbiddenException('无权限编辑此帖子');
            }
            let contentHtml = post.content_html;
            if (dto.content) {
                contentHtml = (0, markdown_util_1.parseMarkdown)(dto.content);
            }
            if (dto.category_id && dto.category_id !== post.category_id) {
                const category = await manager.findOne(category_entity_1.Category, {
                    where: { id: dto.category_id },
                });
                if (!category) {
                    throw new common_1.BadRequestException('分类不存在');
                }
            }
            const updateData = {};
            if (dto.title)
                updateData.title = dto.title;
            if (dto.content)
                updateData.content = dto.content;
            if (dto.content !== undefined)
                updateData.content_html = contentHtml;
            if (dto.category_id !== undefined)
                updateData.category_id = dto.category_id;
            if (dto.server_id !== undefined)
                updateData.server_id = dto.server_id;
            if (dto.required_group_id !== undefined)
                updateData.required_group_id = dto.required_group_id;
            if (dto.post_type)
                updateData.post_type = dto.post_type;
            if (dto.status)
                updateData.status = dto.status;
            if (dto.is_pinned !== undefined)
                updateData.is_pinned = dto.is_pinned;
            await manager.update(post_entity_1.Post, id, updateData);
            if (dto.tags) {
                await manager.delete(post_tag_entity_1.PostTag, { post_id: id });
                if (dto.tags.length > 0) {
                    await this.attachTags(manager, id, dto.tags);
                }
            }
            const result = await manager.findOne(post_entity_1.Post, {
                where: { id },
                relations: ['user', 'category', 'postTags', 'postTags.tag'],
            });
            await this.invalidatePostCache(id);
            this.eventBus.execute('post.updated', { post: result, userId }).catch((err) => console.error('post.updated hook error:', err));
            return result;
        });
    }
    async softDelete(id, userId, userRole) {
        const post = await this.postRepository.findOne({
            where: { id },
            relations: ['user'],
        });
        if (!post) {
            throw new common_1.NotFoundException('帖子不存在');
        }
        const isOwner = post.user_id === userId;
        const canDeleteAny = userRole === 'admin' || userRole === 'moderator';
        if (!isOwner && !canDeleteAny) {
            throw new common_1.ForbiddenException('无权限删除此帖子');
        }
        await this.eventBus.execute('post.delete', { post, userId });
        await this.postRepository.softDelete(id);
        await this.invalidatePostCache(id);
        this.eventBus.execute('post.deleted', { post, userId }).catch((err) => console.error('post.deleted hook error:', err));
    }
    async hardDelete(id) {
        const post = await this.postRepository.findOne({
            where: { id },
        });
        if (!post) {
            throw new common_1.NotFoundException('帖子不存在');
        }
        await this.postTagRepository.delete({ post_id: id });
        await this.postRepository.delete(id);
        await this.invalidatePostCache(id);
    }
    async incrementViewCount(id) {
        const cacheKey = `post_view:${id}`;
        const viewed = await this.redisService.get(cacheKey);
        if (!viewed) {
            await this.postRepository.increment({ id }, 'view_count', 1);
            await this.redisService.set(cacheKey, '1', 60);
        }
    }
    async pin(id, isPinned) {
        await this.postRepository.update(id, { is_pinned: isPinned });
        await this.invalidatePostCache(id);
        const post = await this.postRepository.findOne({
            where: { id },
            relations: ['user', 'category'],
        });
        if (!post) {
            throw new common_1.NotFoundException('帖子不存在');
        }
        return post;
    }
    async move(id, categoryId) {
        const category = await this.categoryRepository.findOne({
            where: { id: categoryId },
        });
        if (!category) {
            throw new common_1.BadRequestException('分类不存在');
        }
        await this.postRepository.update(id, { category_id: categoryId });
        await this.invalidatePostCache(id);
        const post = await this.postRepository.findOne({
            where: { id },
            relations: ['user', 'category'],
        });
        if (!post) {
            throw new common_1.NotFoundException('帖子不存在');
        }
        return post;
    }
    async getReplyCount(postId) {
        return this.replyRepository.count({
            where: { post_id: postId, status: 'active' },
        });
    }
    async getReplies(postId, limit = 20, page = 1) {
        const skip = (page - 1) * limit;
        const [data, total] = await this.replyRepository.findAndCount({
            where: { post_id: postId, status: 'active' },
            relations: ['user'],
            order: { created_at: 'ASC' },
            skip,
            take: limit,
        });
        const totalPages = Math.ceil(total / limit);
        return {
            data,
            total,
            page,
            limit,
            totalPages,
        };
    }
    async attachTags(manager, postId, tagNames) {
        for (const tagName of tagNames) {
            let tag = await manager.findOne(tag_entity_1.Tag, {
                where: { name: tagName },
            });
            if (!tag) {
                const slug = tagName.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
                tag = manager.create(tag_entity_1.Tag, {
                    name: tagName,
                    slug,
                });
                tag = await manager.save(tag_entity_1.Tag, tag);
            }
            const postTag = manager.create(post_tag_entity_1.PostTag, {
                post_id: postId,
                tag_id: tag.id,
            });
            await manager.save(post_tag_entity_1.PostTag, postTag);
        }
    }
    async invalidatePostCache(postId) {
        await this.redisService.del(`post:${postId}`);
        await this.redisService.del(`post_view:${postId}`);
    }
    async search(query, limit = 20) {
        return this.postRepository.find({
            where: [
                { title: (0, typeorm_2.Like)(`%${(0, search_util_1.escapeLike)(query)}%`), status: 'published' },
                { content: (0, typeorm_2.Like)(`%${(0, search_util_1.escapeLike)(query)}%`), status: 'published' },
            ],
            relations: ['user', 'category'],
            take: limit,
            order: { created_at: 'DESC' },
        });
    }
    async findByUser(userId, page = 1, limit = 20) {
        const skip = (page - 1) * limit;
        const [data, total] = await this.postRepository.findAndCount({
            where: { user_id: userId, status: 'published' },
            relations: ['user', 'category'],
            order: { created_at: 'DESC' },
            skip,
            take: limit,
        });
        const totalPages = Math.ceil(total / limit);
        return {
            data,
            total,
            page,
            limit,
            totalPages,
        };
    }
    async getTrending(limit = 10) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        return this.postRepository.find({
            where: {
                status: 'published',
                created_at: (0, typeorm_2.MoreThan)(yesterday),
            },
            relations: ['user', 'category'],
            order: { view_count: 'DESC' },
            take: limit,
        });
    }
    async getPinned(categoryId) {
        const where = { is_pinned: 1, status: 'published' };
        if (categoryId) {
            where.category_id = categoryId;
        }
        return this.postRepository.find({
            where,
            relations: ['user', 'category'],
            order: { created_at: 'DESC' },
        });
    }
};
exports.PostsService = PostsService;
exports.PostsService = PostsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(post_entity_1.Post)),
    __param(1, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __param(2, (0, typeorm_1.InjectRepository)(category_entity_1.Category)),
    __param(3, (0, typeorm_1.InjectRepository)(tag_entity_1.Tag)),
    __param(4, (0, typeorm_1.InjectRepository)(post_tag_entity_1.PostTag)),
    __param(5, (0, typeorm_1.InjectRepository)(reply_entity_1.Reply)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.DataSource,
        redis_service_1.RedisService,
        points_service_1.PointsService,
        groups_service_1.GroupsService,
        event_bus_service_1.EventBusService,
        notifications_service_1.NotificationsService,
        settings_service_1.SettingsService])
], PostsService);
//# sourceMappingURL=posts.service.js.map