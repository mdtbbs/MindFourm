import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Setting } from '@entities/index';
import {
  assertValidColorSetting,
  DEFAULT_BRAND_ACCENT,
  DEFAULT_BRAND_PRIMARY,
  DEFAULT_TOP_NAVIGATION_ITEMS,
  parseTopNavigationItems,
  serializeTopNavigationItems,
} from './navigation-settings.util';
import {
  DEFAULT_WELCOME_NOTIFICATION_BODY,
  DEFAULT_WELCOME_NOTIFICATION_TITLE,
  EMAIL_TEMPLATE_DEFAULTS,
} from '../notifications/email.templates';

/**
 * Placeholder returned instead of a stored secret. When an admin form posts this
 * value back, `setBatch` leaves the stored secret untouched.
 */
export const SECRET_PLACEHOLDER = '__unchanged__';

@Injectable()
export class SettingsService implements OnModuleInit {
  private readonly logger = new Logger(SettingsService.name);
  private settingsCache: Map<string, Setting> = new Map();

  /**
   * Keys readable without authentication. Anything absent from this set is
   * admin-only — the settings table also holds SMTP credentials and the
   * admin-notification webhook secret, so this must stay an allowlist rather
   * than a denylist of known-sensitive keys.
   */
  private static readonly PUBLIC_KEYS: ReadonlySet<string> = new Set([
    'site_name',
    'site_tagline',
    'site_description',
    'site_logo_url',
    'site_footer',
    'site_url',
    'maintenance_mode',
    'brand_primary',
    'brand_accent',
    'top_navigation_items',
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
    'announce_enabled',
    'announce_content',
    'seo_title_suffix',
    'seo_default_description',
    'seo_og_image',
    'seo_sitemap_enabled',
    'seo_robots_enabled',
    'feature_resources_enabled',
    'feature_servers_enabled',
    'feature_groups_enabled',
    'feature_leaderboard_enabled',
    'feature_shop_enabled',
  ]);

  /** Never leaves the server in cleartext, not even to an authenticated admin. */
  private static readonly SECRET_KEYS: ReadonlySet<string> = new Set([
    'smtp_password',
    'admin_notifications_webhook_secret',
  ]);

  // Admin pages group settings by UI section, not always by the historical DB category.
  private readonly categoryKeyGroups: Record<string, Set<string>> = {
    basic: new Set([
      'site_name',
      'site_tagline',
      'site_description',
      'site_logo_url',
      'site_footer',
      'brand_primary',
      'brand_accent',
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
    navigation: new Set([
      'top_navigation_items',
    ]),
    announce: new Set([
      'announce_enabled',
      'announce_content',
    ]),
    moderation: new Set([
      'require_approval',
      'require_post_approval',
      'require_reply_approval',
      'require_avatar_approval',
      'auto_approve_trusted',
    ]),
    notifications: new Set([
      'admin_notifications_enabled',
      'admin_notifications_realtime_enabled',
      'admin_notifications_recipient_roles',
      'admin_notifications_moderation_pending_enabled',
      'admin_notifications_moderation_result_enabled',
      'admin_notifications_webhook_enabled',
      'admin_notifications_webhook_url',
      'admin_notifications_webhook_secret',
      'admin_notifications_webhook_timeout_ms',
    ]),
    email: new Set([
      'smtp_host',
      'smtp_port',
      'smtp_user',
      'smtp_password',
      'smtp_from',
      'smtp_secure',
      'welcome_notification_enabled',
      'welcome_notification_title',
      'welcome_notification_body',
      ...Object.values(EMAIL_TEMPLATE_DEFAULTS).flatMap((config) => [
        config.enabledSettingKey,
        config.subjectSettingKey,
        config.bodySettingKey,
      ]),
    ]),
    features: new Set([
      'feature_resources_enabled',
      'feature_servers_enabled',
      'feature_groups_enabled',
      'feature_leaderboard_enabled',
      'feature_shop_enabled',
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
      { key: 'brand_primary', value: DEFAULT_BRAND_PRIMARY, category: 'basic', description: 'Global primary brand color' },
      { key: 'brand_accent', value: DEFAULT_BRAND_ACCENT, category: 'basic', description: 'Global accent surface color' },
      { key: 'top_navigation_items', value: serializeTopNavigationItems(DEFAULT_TOP_NAVIGATION_ITEMS), category: 'navigation', description: 'Top navigation links and groups as JSON' },
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
      { key: 'admin_notifications_enabled', value: 'true', category: 'notifications', description: 'Enable admin notification inbox' },
      { key: 'admin_notifications_realtime_enabled', value: 'true', category: 'notifications', description: 'Enable real-time admin notification delivery' },
      { key: 'admin_notifications_recipient_roles', value: 'moderator,admin', category: 'notifications', description: 'Roles that receive admin notifications' },
      { key: 'admin_notifications_moderation_pending_enabled', value: 'true', category: 'notifications', description: 'Notify admins about new pending moderation items' },
      { key: 'admin_notifications_moderation_result_enabled', value: 'true', category: 'notifications', description: 'Notify admins about moderation approve/reject actions' },
      { key: 'admin_notifications_webhook_enabled', value: 'false', category: 'notifications', description: 'Enable third-party webhook delivery for admin notifications' },
      { key: 'admin_notifications_webhook_url', value: '', category: 'notifications', description: 'Third-party admin notification webhook URL' },
      { key: 'admin_notifications_webhook_secret', value: '', category: 'notifications', description: 'Optional webhook signature secret for admin notifications' },
      { key: 'admin_notifications_webhook_timeout_ms', value: '5000', category: 'notifications', description: 'Webhook request timeout in milliseconds' },
      { key: 'cleanup_log_retention_days', value: '365', category: 'cleanup', description: 'Days to retain operation logs' },
      { key: 'cleanup_session_retention_days', value: '30', category: 'cleanup', description: 'Days to retain expired sessions' },
      { key: 'cleanup_soft_delete_retention_days', value: '30', category: 'cleanup', description: 'Days to retain soft-deleted items' },
      // Feature toggles (快捷入口开关)
      { key: 'feature_resources_enabled', value: 'true', category: 'features', description: 'Enable resources center' },
      { key: 'feature_servers_enabled', value: 'false', category: 'features', description: 'Enable game servers' },
      { key: 'feature_groups_enabled', value: 'true', category: 'features', description: 'Enable user groups' },
      { key: 'feature_leaderboard_enabled', value: 'true', category: 'features', description: 'Enable points leaderboard' },
      { key: 'feature_shop_enabled', value: 'true', category: 'features', description: 'Enable points shop' },
      // Email settings
      { key: 'smtp_host', value: '', category: 'email', description: 'SMTP server host' },
      { key: 'smtp_port', value: '587', category: 'email', description: 'SMTP server port' },
      { key: 'smtp_user', value: '', category: 'email', description: 'SMTP username' },
      { key: 'smtp_password', value: '', category: 'email', description: 'SMTP password' },
      { key: 'smtp_from', value: 'noreply@mindforum.com', category: 'email', description: 'Email sender address' },
      { key: 'smtp_secure', value: 'true', category: 'email', description: 'Use TLS/SSL' },
      { key: 'welcome_notification_enabled', value: 'true', category: 'email', description: 'Enable welcome notification for new users' },
      { key: 'welcome_notification_title', value: DEFAULT_WELCOME_NOTIFICATION_TITLE, category: 'email', description: 'Welcome notification title template' },
      { key: 'welcome_notification_body', value: DEFAULT_WELCOME_NOTIFICATION_BODY, category: 'email', description: 'Welcome notification body template' },
      ...Object.entries(EMAIL_TEMPLATE_DEFAULTS).flatMap(([event, config]) => [
        {
          key: config.enabledSettingKey,
          value: config.defaultEnabled ? 'true' : 'false',
          category: 'email',
          description: `Enable ${event} email notifications`,
        },
        {
          key: config.subjectSettingKey,
          value: config.defaultSubject,
          category: 'email',
          description: `Subject template for ${event} emails`,
        },
        {
          key: config.bodySettingKey,
          value: config.defaultBody,
          category: 'email',
          description: `Body template for ${event} emails`,
        },
      ]),
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
   * Get all settings from memory.
   *
   * Returns secrets in cleartext — for internal service use only. Never expose
   * the result on an HTTP response; use `getPublicSettings` or
   * `getAllForAdmin` instead.
   */
  async getAll(): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    for (const [, setting] of this.settingsCache) {
      result[setting.key] = setting.value;
    }
    return result;
  }

  /**
   * Get settings by category.
   *
   * Returns secrets in cleartext — for internal service use only (e.g.
   * `EmailService` reading the `email` category). Never expose the result on an
   * HTTP response; use `getPublicByCategory` or `getByCategoryForAdmin`.
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
   * Settings safe to serve to unauthenticated callers.
   */
  async getPublicSettings(): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    for (const key of SettingsService.PUBLIC_KEYS) {
      const setting = this.settingsCache.get(key);
      if (setting) {
        result[key] = setting.value;
      }
    }
    return result;
  }

  /**
   * Settings of one category, narrowed to the public allowlist.
   */
  async getPublicByCategory(category: string): Promise<Record<string, string>> {
    const all = await this.getByCategory(category);
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(all)) {
      if (SettingsService.PUBLIC_KEYS.has(key)) {
        result[key] = value;
      }
    }
    return result;
  }

  /**
   * Everything, with stored secrets replaced by {@link SECRET_PLACEHOLDER} so an
   * admin panel can render the form without receiving the credential itself.
   */
  async getAllForAdmin(): Promise<Record<string, string>> {
    return this.maskSecrets(await this.getAll());
  }

  async getByCategoryForAdmin(category: string): Promise<Record<string, string>> {
    return this.maskSecrets(await this.getByCategory(category));
  }

  private maskSecrets(settings: Record<string, string>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(settings)) {
      result[key] = SettingsService.SECRET_KEYS.has(key) && value ? SECRET_PLACEHOLDER : value;
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
    const normalizedPairs = new Map<string, string>();

    for (const [key, value] of Object.entries(keyValuePairs)) {
      if (value === SECRET_PLACEHOLDER) {
        continue;
      }

      let normalizedValue = value;
      if (key === 'brand_primary' || key === 'brand_accent' || key === 'latest_posts_accent_color') {
        assertValidColorSetting(key, value);
        normalizedValue = value.trim();
      }
      if (key === 'top_navigation_items') {
        normalizedValue = serializeTopNavigationItems(parseTopNavigationItems(value));
      }

      normalizedPairs.set(key, normalizedValue);
    }

    for (const [key, value] of normalizedPairs.entries()) {
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
