import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Setting } from '@entities/index';

@Injectable()
export class SettingsService implements OnModuleInit {
  private readonly logger = new Logger(SettingsService.name);
  private settingsCache: Map<string, Setting> = new Map();
  // Admin pages group settings by UI section, not always by the historical DB category.
  private readonly categoryKeyGroups: Record<string, Set<string>> = {
    basic: new Set([
      'site_name',
      'site_tagline',
      'site_description',
      'site_logo_url',
      'site_footer',
    ]),
    display: new Set([
      'posts_per_page',
      'default_sort',
      'replies_per_page',
      'latest_posts_title',
      'latest_posts_description',
      'latest_posts_density',
      'latest_posts_accent_color',
      'latest_posts_show_excerpt',
      'latest_posts_show_tags',
      'latest_posts_show_stats',
      'latest_posts_show_index',
    ]),
    announce: new Set([
      'announce_enabled',
      'announce_content',
    ]),
    seo: new Set([
      'seo_title_suffix',
      'seo_default_description',
      'seo_og_image',
      'seo_sitemap_enabled',
      'seo_robots_enabled',
    ]),
  };

  constructor(
    @InjectRepository(Setting)
    private settingRepository: Repository<Setting>,
  ) {}

  async onModuleInit() {
    try {
      await this.seedDefaults();
      await this.loadSettings();
    } catch (error) {
      this.logger.warn(`Settings initialization deferred: ${(error as Error).message}`);
    }
  }

  /**
   * Seed default settings (INSERT IGNORE)
   */
  async seedDefaults(): Promise<void> {
    const defaults = [
      { key: 'site_name', value: 'MindFourm', category: 'basic', description: 'Site name' },
      { key: 'site_tagline', value: '', category: 'basic', description: 'Site tagline' },
      { key: 'site_description', value: 'Mindustry community forum', category: 'basic', description: 'Site description' },
      { key: 'site_logo_url', value: '', category: 'basic', description: 'Site logo URL' },
      { key: 'site_footer', value: '', category: 'basic', description: 'Footer text' },
      { key: 'site_url', value: 'http://localhost:3000', category: 'basic', description: 'Site URL' },
      { key: 'admin_email', value: 'admin@example.com', category: 'basic', description: 'Admin email' },
      { key: 'maintenance_mode', value: 'false', category: 'basic', description: 'Maintenance mode toggle' },
      { key: 'posts_per_page', value: '20', category: 'posts', description: 'Posts per page' },
      { key: 'max_post_length', value: '10000', category: 'posts', description: 'Maximum post length' },
      { key: 'allow_attachments', value: 'true', category: 'posts', description: 'Allow file attachments' },
      { key: 'default_sort', value: 'newest', category: 'display', description: 'Default post sort order' },
      { key: 'replies_per_page', value: '50', category: 'display', description: 'Replies per page' },
      { key: 'latest_posts_title', value: '最新帖子', category: 'display', description: 'Latest posts section title' },
      { key: 'latest_posts_description', value: '浅蓝、直角、低噪音的论坛界面，重点放在帖子层级和浏览效率。', category: 'display', description: 'Latest posts section description' },
      { key: 'latest_posts_density', value: 'compact', category: 'display', description: 'Latest posts display density: compact or comfortable' },
      { key: 'latest_posts_accent_color', value: '#2f80ed', category: 'display', description: 'Latest posts accent color' },
      { key: 'latest_posts_show_excerpt', value: 'true', category: 'display', description: 'Show post excerpt in latest posts list' },
      { key: 'latest_posts_show_tags', value: 'true', category: 'display', description: 'Show tags in latest posts list' },
      { key: 'latest_posts_show_stats', value: 'true', category: 'display', description: 'Show stats in latest posts list' },
      { key: 'latest_posts_show_index', value: 'true', category: 'display', description: 'Show row index in latest posts list' },
      { key: 'announce_enabled', value: 'false', category: 'announce', description: 'Enable announcement banner' },
      { key: 'announce_content', value: '', category: 'announce', description: 'Announcement banner content' },
      { key: 'seo_title_suffix', value: ' | MindForum', category: 'seo', description: 'SEO title suffix' },
      { key: 'seo_default_description', value: 'A modern community forum', category: 'seo', description: 'Default SEO description' },
      { key: 'seo_og_image', value: '', category: 'seo', description: 'Default Open Graph image' },
      { key: 'seo_sitemap_enabled', value: 'true', category: 'seo', description: 'Enable sitemap.xml generation' },
      { key: 'seo_robots_enabled', value: 'true', category: 'seo', description: 'Enable robots.txt indexing' },
      { key: 'require_approval', value: 'true', category: 'moderation', description: 'Require post approval' },
      { key: 'require_post_approval', value: 'true', category: 'moderation', description: 'Require post approval before publishing' },
      { key: 'require_reply_approval', value: 'true', category: 'moderation', description: 'Require reply approval before publishing' },
      { key: 'require_avatar_approval', value: 'true', category: 'moderation', description: 'Require avatar approval before applying' },
      { key: 'auto_approve_trusted', value: 'false', category: 'moderation', description: 'Auto-approve trusted users' },
      { key: 'cleanup_log_retention_days', value: '365', category: 'cleanup', description: 'Days to retain operation logs' },
      { key: 'cleanup_session_retention_days', value: '30', category: 'cleanup', description: 'Days to retain expired sessions' },
      { key: 'cleanup_soft_delete_retention_days', value: '30', category: 'cleanup', description: 'Days to retain soft-deleted items' },
      // Email settings
      { key: 'smtp_host', value: '', category: 'email', description: 'SMTP server host' },
      { key: 'smtp_port', value: '587', category: 'email', description: 'SMTP server port' },
      { key: 'smtp_user', value: '', category: 'email', description: 'SMTP username' },
      { key: 'smtp_password', value: '', category: 'email', description: 'SMTP password' },
      { key: 'smtp_from', value: 'noreply@mindforum.com', category: 'email', description: 'Email sender address' },
      { key: 'smtp_secure', value: 'true', category: 'email', description: 'Use TLS/SSL' },
    ];

    for (const setting of defaults) {
      await this.settingRepository.query(
        'INSERT IGNORE INTO settings (`key`, `value`, category, description) VALUES (?, ?, ?, ?)',
        [setting.key, setting.value, setting.category, setting.description],
      );
    }

    // Reload cache after seeding
    await this.loadSettings();
  }

  /**
   * Get all settings from memory
   */
  async getAll(): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    for (const [, setting] of this.settingsCache) {
      result[setting.key] = setting.value;
    }
    return result;
  }

  /**
   * Get settings by category
   */
  async getByCategory(category: string): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    const logicalKeys = this.categoryKeyGroups[category];

    for (const [, setting] of this.settingsCache) {
      if (logicalKeys ? logicalKeys.has(setting.key) : setting.category === category) {
        result[setting.key] = setting.value;
      }
    }
    return result;
  }

  /**
   * Get a single setting value
   */
  async get(key: string): Promise<string | null> {
    const setting = this.settingsCache.get(key);
    return setting ? setting.value : null;
  }

  /**
   * Get a setting as a number
   */
  async getNumber(key: string): Promise<number | null> {
    const value = await this.get(key);
    return value ? parseFloat(value) : null;
  }

  async getBoolean(key: string, defaultValue = false): Promise<boolean> {
    const value = await this.get(key);
    if (value === null) {
      return defaultValue;
    }
    return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
  }

  /**
   * Batch update settings (upsert)
   */
  async setBatch(category: string, keyValuePairs: Record<string, string>): Promise<void> {
    for (const [key, value] of Object.entries(keyValuePairs)) {
      await this.settingRepository.query(
        'INSERT INTO settings (`key`, `value`, category, updated_at) VALUES (?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE `value` = ?, category = ?, updated_at = NOW()',
        [key, value, category, value, category],
      );
    }

    // Reload cache after update
    await this.loadSettings();
  }

  /**
   * Load all settings from DB into memory
   */
  private async loadSettings(): Promise<void> {
    const settings = await this.settingRepository.find();
    this.settingsCache.clear();
    for (const setting of settings) {
      this.settingsCache.set(setting.key, setting);
    }
  }
}
