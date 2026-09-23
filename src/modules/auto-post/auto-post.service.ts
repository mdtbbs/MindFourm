import { Injectable, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Post } from '@entities/post.entity';
import { Category } from '@entities/category.entity';
import { Notification } from '@entities/notification.entity';
import { ContentRelation } from '@entities/content-relation.entity';
import { parseMarkdown } from '@common/utils/markdown.util';

@Injectable()
export class AutoPostService {
  private readonly logger = new Logger(AutoPostService.name);

  constructor(
    @InjectRepository(Post)
    private postRepo: Repository<Post>,
    @InjectRepository(Category)
    private categoryRepo: Repository<Category>,
    @InjectRepository(Notification)
    private notificationRepo: Repository<Notification>,
    @InjectRepository(ContentRelation)
    private relationRepo: Repository<ContentRelation>,
  ) {}

  /**
   * Create an auto-post announcement when a server is approved by EasyManager
   */
  async createServerAnnouncement(data: {
    server_name: string;
    server_id: number;
    description: string;
    category_slug?: string;
    user_id?: number; // The user who applied for the server
    event_id?: string; // For idempotency
  }) {
    // Idempotency: check if post already exists for this server
    const link = await this.relationRepo.findOne({ where: {
      source_type: 'post', target_type: 'game_server', target_id: String(data.server_id), relation_type: 'related',
    } });
    const existing = link ? await this.postRepo.findOne({ where: { id: link.source_id, post_type: 'server_announcement' } }) : null;

    if (existing) {
      this.logger.warn(`Server announcement already exists for server ${data.server_id}`);
      return { post: existing, created: false };
    }

    // Find or create default category
    let category = await this.categoryRepo.findOne({
      where: { slug: data.category_slug || 'announcements' },
    });

    if (!category) {
      // Try to find any category, or use null
      category = await this.categoryRepo.findOne({
        order: { id: 'ASC' },
      });
    }

    const content = `## 🎉 ${data.server_name}\n\n${data.description}\n\n*This server has been approved and is now available.*`;

    const post = this.postRepo.create({
      user_id: 1, // System user
      category_id: category?.id,
      post_type: 'server_announcement',
      title: `Server Approved: ${data.server_name}`,
      content,
      content_html: parseMarkdown(content),
      status: 'published',
    });

    const savedPost = await this.postRepo.save(post) as Post;
    await this.relationRepo.save(this.relationRepo.create({ source_type: 'post', source_id: savedPost.id,
      target_type: 'game_server', target_id: String(data.server_id), relation_type: 'related' }));

    // Create notification for the applicant if user_id provided
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
}
