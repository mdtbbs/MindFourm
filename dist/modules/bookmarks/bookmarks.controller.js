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
exports.BookmarksController = void 0;
const common_1 = require("@nestjs/common");
const bookmarks_service_1 = require("./bookmarks.service");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
let BookmarksController = class BookmarksController {
    constructor(bookmarksService) {
        this.bookmarksService = bookmarksService;
    }
    async getBookmarks(req, page, limit) {
        const userId = req.user.id;
        const result = await this.bookmarksService.getByUserId(userId, page ? Number(page) : 1, limit ? Number(limit) : 20);
        return {
            data: result.bookmarks,
            pagination: {
                page: page ? Number(page) : 1,
                limit: limit ? Number(limit) : 20,
                total: result.total,
            },
        };
    }
    async checkBookmark(postId, req) {
        const userId = req.user.id;
        const isBookmarked = await this.bookmarksService.check(userId, Number(postId));
        return { isBookmarked };
    }
    async addBookmark(postId, req) {
        const userId = req.user.id;
        const bookmark = await this.bookmarksService.add(userId, Number(postId));
        return { message: 'Bookmark added', data: bookmark };
    }
    async removeBookmark(postId, req) {
        const userId = req.user.id;
        await this.bookmarksService.remove(userId, Number(postId));
        return { message: 'Bookmark removed' };
    }
};
exports.BookmarksController = BookmarksController;
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Get)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('page')),
    __param(2, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, Number]),
    __metadata("design:returntype", Promise)
], BookmarksController.prototype, "getBookmarks", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Get)('check/:postId'),
    __param(0, (0, common_1.Param)('postId')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], BookmarksController.prototype, "checkBookmark", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Post)(':postId'),
    __param(0, (0, common_1.Param)('postId')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], BookmarksController.prototype, "addBookmark", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Delete)(':postId'),
    __param(0, (0, common_1.Param)('postId')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], BookmarksController.prototype, "removeBookmark", null);
exports.BookmarksController = BookmarksController = __decorate([
    (0, common_1.Controller)('bookmarks'),
    __metadata("design:paramtypes", [bookmarks_service_1.BookmarksService])
], BookmarksController);
//# sourceMappingURL=bookmarks.controller.js.map