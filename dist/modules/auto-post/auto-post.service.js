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
var AutoPostService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutoPostService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const post_entity_1 = require("../../entities/post.entity");
const category_entity_1 = require("../../entities/category.entity");
const notification_entity_1 = require("../../entities/notification.entity");
const markdown_util_1 = require("../../common/utils/markdown.util");
let AutoPostService = AutoPostService_1 = class AutoPostService {
    constructor(postRepo, categoryRepo, notificationRepo) {
        this.postRepo = postRepo;
        this.categoryRepo = categoryRepo;
        this.notificationRepo = notificationRepo;
        this.logger = new common_1.Logger(AutoPostService_1.name);
    }
    async createServerAnnouncement(data) {
        const existing = await this.postRepo.findOne({
            where: {
                server_id: data.server_id,
                post_type: 'server_announcement',
            },
        });
        if (existing) {
            this.logger.warn(`Server announcement already exists for server ${data.server_id}`);
            return { post: existing, created: false };
        }
        let category = await this.categoryRepo.findOne({
            where: { slug: data.category_slug || 'announcements' },
        });
        if (!category) {
            category = await this.categoryRepo.findOne({
                order: { id: 'ASC' },
            });
        }
        const content = `## 🎉 ${data.server_name}\n\n${data.description}\n\n*This server has been approved and is now available.*`;
        const post = this.postRepo.create({
            user_id: 1,
            category_id: category?.id,
            server_id: data.server_id,
            post_type: 'server_announcement',
            title: `Server Approved: ${data.server_name}`,
            content,
            content_html: (0, markdown_util_1.parseMarkdown)(content),
            status: 'published',
        });
        const savedPost = await this.postRepo.save(post);
        if (data.user_id) {
            const notification = this.notificationRepo.create({
                user_id: data.user_id,
                type: 'server_approved',
                post_id: savedPost.id,
                is_read: 0,
            });
            await this.notificationRepo.save(notification);
        }
        return { post: savedPost, created: true };
    }
};
exports.AutoPostService = AutoPostService;
exports.AutoPostService = AutoPostService = AutoPostService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(post_entity_1.Post)),
    __param(1, (0, typeorm_1.InjectRepository)(category_entity_1.Category)),
    __param(2, (0, typeorm_1.InjectRepository)(notification_entity_1.Notification)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository])
], AutoPostService);
//# sourceMappingURL=auto-post.service.js.map