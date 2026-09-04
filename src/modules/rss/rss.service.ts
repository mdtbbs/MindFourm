import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Post } from '@entities/post.entity';
import { Category } from '@entities/category.entity';
import { ConfigService } from '@nestjs/config';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class RssService {
  constructor(
    @InjectRepository(Post)
    private postRepo: Repository<Post>,
    @InjectRepository(Category)
    private categoryRepo: Repository<Category>,
    private configService: ConfigService,
    private settingsService: SettingsService,
  ) {}

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private toRFC822(date: Date): string {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const d = date;
    return `${days[d.getDay()]}, ${d.getDate().toString().padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()} ${d.toTimeString().slice(0, 8)} +0800`;
  }

  async generatePostsRss(): Promise<string> {
    const frontendUrl = await this.settingsService.get('site_url')
      || this.configService.get<string>('app.frontendUrl')
      || 'http://localhost:3000';
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

  async generateCategoryRss(categorySlug: string): Promise<string> {
    const frontendUrl = await this.settingsService.get('site_url')
      || this.configService.get<string>('app.frontendUrl')
      || 'http://localhost:3000';

    const category = await this.categoryRepo.findOne({ where: { slug: categorySlug } });
    if (!category) throw new Error('Category not found');

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
}
