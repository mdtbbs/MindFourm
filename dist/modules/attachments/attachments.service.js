"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AttachmentsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const attachment_entity_1 = require("../../entities/attachment.entity");
const post_entity_1 = require("../../entities/post.entity");
const promises_1 = require("fs/promises");
const path = __importStar(require("path"));
let AttachmentsService = class AttachmentsService {
    constructor(attachmentRepository, postRepository) {
        this.attachmentRepository = attachmentRepository;
        this.postRepository = postRepository;
    }
    async create(data) {
        const attachment = this.attachmentRepository.create({
            ...data,
            download_count: 0,
        });
        return await this.attachmentRepository.save(attachment);
    }
    async getByPostId(postId) {
        return await this.attachmentRepository.find({
            where: { post_id: postId },
            order: { created_at: 'ASC' },
        });
    }
    async getByReplyId(replyId) {
        return await this.attachmentRepository.find({
            where: { reply_id: replyId },
            order: { created_at: 'ASC' },
        });
    }
    async incrementDownloadCount(id) {
        await this.attachmentRepository.increment({ id }, 'download_count', 1);
    }
    async getById(id) {
        const attachment = await this.attachmentRepository.findOne({
            where: { id },
        });
        if (!attachment) {
            throw new common_1.NotFoundException('Attachment not found');
        }
        return attachment;
    }
    async delete(id, userId, isAdmin) {
        const attachment = await this.getById(id);
        if (attachment.user_id !== userId && !isAdmin) {
            throw new common_1.ForbiddenException('You do not have permission to delete this attachment');
        }
        try {
            const filePath = path.resolve(attachment.file_path);
            await (0, promises_1.unlink)(filePath);
        }
        catch (error) {
            console.error(`Failed to delete file from disk: ${attachment.file_path}`, error);
        }
        await this.attachmentRepository.remove(attachment);
    }
};
exports.AttachmentsService = AttachmentsService;
exports.AttachmentsService = AttachmentsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(attachment_entity_1.Attachment)),
    __param(1, (0, typeorm_1.InjectRepository)(post_entity_1.Post)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository])
], AttachmentsService);
//# sourceMappingURL=attachments.service.js.map