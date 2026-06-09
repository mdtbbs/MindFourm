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
exports.RssService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const post_entity_1 = require("../../entities/post.entity");
const category_entity_1 = require("../../entities/category.entity");
const config_1 = require("@nestjs/config");
let RssService = class RssService {
    constructor(postRepo, categoryRepo, configService) {
        this.postRepo = postRepo;
        this.categoryRepo = categoryRepo;
        this.configService = configService;
    }
    escapeXml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
    toRFC822(date) {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const d = date;
        return `${days[d.getDay()]}, ${d.getDate().toString().padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()} ${d.toTimeString().slice(0, 8)} +0800`;
    }
    async generatePostsRss() {
        const frontendUrl = this.configService.get('FRONTEND_URL') || 'http://localhost:3000';
        const posts = await this.postRepo.find({
            where: { status: 'published' },
            relations: ['user', 'category'],
            order: { created_at: 'DESC' },
            take: 50,
        });
        const items = posts.map(post => `
    <item>
      <title>${this.escapeXml(post.title)}</title>
      <link>${frontendUrl}/posts/${post.id}</link>
      <description>${this.escapeXml(post.content.substring(0, 300))}</description>
      <author>${this.escapeXml(post.user?.username || 'Unknown')}</author>
      <category>${this.escapeXml(post.category?.name || 'Uncategorized')}</category>
      <pubDate>${this.toRFC822(post.created_at)}</pubDate>
      <guid>${post.id}</guid>
    </item>`).join('');
        return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>MindFourm</title>
    <link>${frontendUrl}</link>
    <description>MindFourm 社区最新帖子</description>
    <language>zh-CN</language>
    <lastBuildDate>${this.toRFC822(new Date())}</lastBuildDate>${items}
  </channel>
</rss>`;
    }
    async generateCategoryRss(categorySlug) {
        const frontendUrl = this.configService.get('FRONTEND_URL') || 'http://localhost:3000';
        const category = await this.categoryRepo.findOne({ where: { slug: categorySlug } });
        if (!category)
            throw new Error('Category not found');
        const posts = await this.postRepo.find({
            where: { status: 'published', category_id: category.id },
            relations: ['user'],
            order: { created_at: 'DESC' },
            take: 50,
        });
        const items = posts.map(post => `
    <item>
      <title>${this.escapeXml(post.title)}</title>
      <link>${frontendUrl}/posts/${post.id}</link>
      <description>${this.escapeXml(post.content.substring(0, 300))}</description>
      <author>${this.escapeXml(post.user?.username || 'Unknown')}</author>
      <pubDate>${this.toRFC822(post.created_at)}</pubDate>
      <guid>${post.id}</guid>
    </item>`).join('');
        return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>MindFourm - ${this.escapeXml(category.name)}</title>
    <link>${frontendUrl}/categories/${categorySlug}</link>
    <description>${this.escapeXml(category.name || '分类帖子')}</description>
    <language>zh-CN</language>
    <lastBuildDate>${this.toRFC822(new Date())}</lastBuildDate>${items}
  </channel>
</rss>`;
    }
};
exports.RssService = RssService;
exports.RssService = RssService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(post_entity_1.Post)),
    __param(1, (0, typeorm_1.InjectRepository)(category_entity_1.Category)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        config_1.ConfigService])
], RssService);
//# sourceMappingURL=rss.service.js.map