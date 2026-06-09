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
exports.StatsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const index_1 = require("../../entities/index");
const redis_service_1 = require("../../database/redis.service");
let StatsService = class StatsService {
    constructor(postRepository, replyRepository, userRepository, redisService) {
        this.postRepository = postRepository;
        this.replyRepository = replyRepository;
        this.userRepository = userRepository;
        this.redisService = redisService;
    }
    async getDashboardStats() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const yesterday = new Date();
        yesterday.setHours(0, 0, 0, 0);
        yesterday.setDate(yesterday.getDate() - 1);
        const [stats] = await this.postRepository.query(`
      SELECT
        (SELECT COUNT(*) FROM posts WHERE status = 'published') as total_posts,
        (SELECT COUNT(*) FROM replies WHERE status = 'active') as total_replies,
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT COUNT(*) FROM posts WHERE status = 'published' AND created_at >= ?) as posts_today,
        (SELECT COUNT(*) FROM replies WHERE status = 'active' AND created_at >= ?) as replies_today
    `, [today, today]);
        const sessionKeys = await this.redisService.keys('session:*');
        const active_24h = sessionKeys.length;
        return {
            total_posts: parseInt(stats.total_posts, 10),
            total_replies: parseInt(stats.total_replies, 10),
            total_users: parseInt(stats.total_users, 10),
            posts_today: parseInt(stats.posts_today, 10),
            replies_today: parseInt(stats.replies_today, 10),
            active_24h,
        };
    }
    async get7DayActivity() {
        const result = await this.postRepository.query(`
      WITH RECURSIVE dates AS (
        SELECT CURDATE() as date
        UNION ALL
        SELECT DATE_SUB(date, INTERVAL 1 DAY)
        FROM dates
        WHERE DATE_SUB(date, INTERVAL 1 DAY) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
      )
      SELECT
        d.date,
        COUNT(p.id) as count
      FROM dates d
      LEFT JOIN posts p ON DATE(p.created_at) = d.date AND p.status = 'published'
      GROUP BY d.date
      ORDER BY d.date ASC
    `);
        return result.map((row) => ({
            date: row.date,
            count: parseInt(row.count, 10),
        }));
    }
};
exports.StatsService = StatsService;
exports.StatsService = StatsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(index_1.Post)),
    __param(1, (0, typeorm_1.InjectRepository)(index_1.Reply)),
    __param(2, (0, typeorm_1.InjectRepository)(index_1.User)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        redis_service_1.RedisService])
], StatsService);
//# sourceMappingURL=stats.service.js.map