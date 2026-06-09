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
exports.PostServersService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const post_entity_1 = require("../../entities/post.entity");
const user_entity_1 = require("../../entities/user.entity");
let PostServersService = class PostServersService {
    constructor(postRepo, userRepo) {
        this.postRepo = postRepo;
        this.userRepo = userRepo;
    }
    async getPostsByServer(serverId) {
        return this.postRepo
            .createQueryBuilder('p')
            .leftJoinAndSelect('p.user', 'u')
            .leftJoinAndSelect('p.category', 'c')
            .where('p.server_id = :serverId', { serverId })
            .andWhere('p.status = :status', { status: 'published' })
            .orderBy('p.created_at', 'DESC')
            .getMany();
    }
    async getForumPostsByServer(serverId) {
        const posts = await this.getPostsByServer(serverId);
        return posts.map((p) => ({
            id: p.id,
            title: p.title,
            post_type: p.post_type,
            status: p.status,
            created_at: p.created_at,
            user: { username: p.user?.username },
            category: { name: p.category?.name, slug: p.category?.slug },
        }));
    }
    async linkPostToServer(postId, serverId, userId) {
        const post = await this.postRepo.findOne({ where: { id: postId } });
        if (!post) {
            throw new common_1.NotFoundException('Post not found');
        }
        if (post.user_id !== userId) {
            throw new common_1.ForbiddenException('You can only link your own posts');
        }
        post.server_id = serverId;
        await this.postRepo.save(post);
        return { success: true, post_id: postId, server_id: serverId };
    }
    async unlinkPostFromServer(postId, userId) {
        const post = await this.postRepo.findOne({ where: { id: postId } });
        if (!post) {
            throw new common_1.NotFoundException('Post not found');
        }
        if (post.user_id !== userId) {
            throw new common_1.ForbiddenException('You can only unlink your own posts');
        }
        post.server_id = undefined;
        await this.postRepo.save(post);
        return { success: true, post_id: postId };
    }
};
exports.PostServersService = PostServersService;
exports.PostServersService = PostServersService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(post_entity_1.Post)),
    __param(1, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository])
], PostServersService);
//# sourceMappingURL=post-servers.service.js.map