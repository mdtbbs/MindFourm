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
  normalizeFooterFriendlyLinks,
} from './footer-settings.util';
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

// --- Default content for informational pages (about / terms / privacy / thanks).
// Seeded via seedDefaults() with INSERT IGNORE semantics, so existing installs
// keep whatever the admin has edited; these only populate fresh databases.
// Wording is neutral ("本站"/"本论坛") so it applies to any installation
// regardless of the admin-configured site_name.

const DEFAULT_ABOUT_CONTENT = `# 欢迎来到本论坛

这是一个面向 **Mindustry** 玩家与创作者的中文社区论坛。无论你是刚入门的新手、经验丰富的工厂设计老手，还是热爱分享模组、地图、教程的创作者，这里都欢迎你。

## 我们做什么

- **玩法交流**：分享你的工厂设计、逻辑电路、资源产线优化心得
- **资源发布**：发布与下载模组、地图、材质包
- **教程沉淀**：从入门到进阶的系统化教程，由社区共同维护
- **服务器信息**：寻找联机服务器、发布自己的服务器、分享联机经验
- **活动组织**：社区赛事、创作征集、主题讨论

## 面向谁

- **玩家**：原版通关党、联机对战爱好者、模组重度用户
- **模组作者**：发布作品、收集反馈、与玩家交流
- **地图作者**：展示作品、接受评价、寻找合作者
- **服务器主**：宣传服务器、招募玩家、交流运营经验

## 如何参与

1. 通过 MindAuth 一键注册登录
2. 在对应版块发起或参与讨论
3. 在资源中心上传你的模组、地图
4. 为优质内容点赞，帮助它们被更多人看到

## 联系我们

- 问题反馈：使用站内的「意见反馈」入口
- 合作联系：通过论坛私信联系管理员

> 本社区与 Mindustry 原作者 [Anuken](https://github.com/Anuken) 无官方隶属关系，是由社区爱好者自发运营的交流平台。
`;

const DEFAULT_TERMS_CONTENT = `# 服务条款

欢迎使用本站。使用本站即表示你同意以下条款。如果你不同意，请停止使用本站。

## 账号

- 你通过 MindAuth 统一身份认证系统登录本站
- 你有责任妥善保管自己的账号凭证
- 一个自然人仅应持有一个账号
- 本站不对因账号被盗用导致的损失承担责任

## 用户行为规范

你在使用本站时应当遵守以下规范：

- 遵守中华人民共和国法律法规
- 尊重他人，不进行人身攻击、歧视、骚扰
- 不发布色情、暴力、政治敏感等违规内容
- 不发布广告、垃圾信息、恶意链接
- 不冒充他人或误导他人关于你的身份
- 不试图干扰或破坏本站的正常运行

## 内容版权

- 你发布的内容（帖子、回复、资源）著作权归你本人所有
- 你发布的内容即视为授予本站非独占的、全球性的、免费的展示与传播权
- 你应确保对发布的内容拥有合法权利，不侵犯他人版权
- **模组与地图**：Mindustry 模组和地图的版权遵循各自项目声明的 LICENSE；转载时须保留原 LICENSE 与作者信息
- 引用他人内容时应注明来源，并在必要时取得授权

## 资源审核

- 上传到资源中心的文件会经过管理员审核
- 严禁上传含恶意代码、后门、挖矿程序的模组
- 严禁上传未获授权的商业内容
- 违规资源将被下架，严重者账号将被处理

## 违规处理

对于违反本条款的行为，本站有权采取以下措施（根据情节轻重）：

- 警告、删帖、禁言
- 临时封禁或永久封禁账号
- 屏蔽 IP 地址
- 必要时向有关部门报告

## 免责声明

- 本站按"现状"提供，不对可用性、准确性作任何明示或暗示的保证
- 用户发布的内容仅代表作者个人观点，不代表本站立场
- 因不可抗力或本站无法控制的原因导致的服务中断，本站不承担责任

## 条款更新

本条款可能不定期更新。重大变更会通过站内公告通知。

*最后更新：2026 年 1 月*
`;

const DEFAULT_PRIVACY_CONTENT = `# 隐私政策

本站重视你的隐私。本政策说明我们收集哪些数据、如何使用、以及如何保护。

## 我们收集什么

**账号数据**：你通过 MindAuth 登录时，我们会保存你的用户名、邮箱、头像等基础资料。

**行为数据**：你发布的帖子、回复、点赞、收藏、私信、上传的资源，以及浏览行为（如浏览量统计）。

**技术数据**：浏览器类型、操作系统、IP 地址、访问时间，用于安全和反作弊目的。

## 如何使用这些数据

- 提供论坛核心功能（发帖、回复、私信、资源分享）
- 推送你订阅的通知（站内、邮件、实时推送）
- 维护社区秩序（反垃圾、反作弊、处理举报）
- 改进站点体验（统计分析，不涉及个人识别）

## 数据保护

- 密码和会话凭证采用加密存储
- 敏感操作（如密码变更、邮箱变更）通过 MindAuth 单点登录保护
- 我们仅保留提供服务所需的最小数据量
- 定期清理过期日志与临时数据

## Cookie 与本地存储

本站仅使用必要的 session cookie 维持登录状态，不使用第三方跟踪 cookie。

## 第三方服务

本站可能接入以下第三方服务：

- **MindAuth**：统一身份认证服务，处理你的登录流程
- **MindFileList**：资源文件托管服务，存储你上传的文件

这些服务有各自独立的隐私政策，建议你查阅。

## 你的权利

你有权：

- **查询**：通过个人设置页查看我们保存的你的数据
- **更正**：修改个人资料、头像等可编辑信息
- **删除**：联系管理员申请注销账号、删除你的数据
- **撤回同意**：在个人设置中关闭邮件通知等可选功能

## 未成年人保护

本站不主动面向未满 14 周岁的未成年人提供服务。如发现未成年人未经监护人同意注册账号，我们将在核实后删除其账号与相关数据。

## 联系我们

对本政策有任何疑问，请通过论坛私信联系管理员。

*最后更新：2026 年 1 月*
`;

const DEFAULT_THANKS_CONTENT = `# 鸣谢

本站的诞生与运行离不开许多人的贡献。我们在此向他们致以诚挚的感谢。

## Mindustry 原作者

感谢 **[Anuken](https://github.com/Anuken)** 创造了 Mindustry 这款优秀的作品，并以开源的方式让全世界玩家与创作者共同参与它的成长。Mindustry 本身是本站一切活动的源头。

## 模组开发者

感谢所有为 Mindustry 开发模组的作者——无论是新增内容、优化体验、还是拓展玩法边界。你们让这款游戏拥有了远超原版的生命力。

## 地图作者

感谢绘制并分享地图的创作者。每一张精心设计的地图，都是一次独特的挑战或一段值得体验的故事。

## 教程作者

感谢那些把经验写成文字的人。从新手入门、逻辑电路入门、到产线优化、服务器搭建，你们的教程让后来者少走无数弯路。

## 翻译团队

感谢参与 Mindustry 本体、模组、文档翻译的贡献者。语言不应成为享受这款游戏的障碍。

## 服务器运营者

感谢搭建并维护公开服务器的朋友们。你们为无法自建环境的玩家提供了联机对战、合作建造、角色扮演的场所。

## 社区活跃成员

感谢每一位发帖、回复、点赞、举报垃圾内容的成员。一个健康的社区需要每个人的日常参与。

## 成为贡献者

如果你也希望自己的名字出现在这里，欢迎通过以下方式参与：

- 发布高质量的模组、地图、教程
- 在讨论中乐于助人
- 帮助翻译或校对内容
- 反馈站点问题或提出改进建议

> 如有遗漏或希望添加 / 移除你的名字，请通过站内私信联系管理员。
`;

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
    'footer_copyright',
    'footer_icp_number',
    'footer_icp_url',
    'footer_police_number',
    'footer_police_url',
    'footer_friendly_links',
    'footer_about_content',
    'footer_thanks_content',
    'footer_terms_content',
    'footer_privacy_content',
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
    'feature_lanlink_enabled',
    'terms_summary',
    'site_favicon_url',
    'sidebar_title',
  ]);

  /**
   * Brand fields that must always appear in the public payload, even when
   * absent from the database. Missing values are returned as empty strings so
   * that frontend consumers can rely on a stable shape.
   */
  private static readonly BRAND_FIELDS: ReadonlySet<string> = new Set([
    'site_name',
    'site_tagline',
    'site_description',
    'site_logo_url',
    'site_favicon_url',
    'sidebar_title',
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
      'site_favicon_url',
      'sidebar_title',
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
    footer: new Set([
      'footer_copyright',
      'footer_icp_number',
      'footer_icp_url',
      'footer_police_number',
      'footer_police_url',
      'footer_friendly_links',
      'footer_about_content',
      'footer_thanks_content',
      'footer_terms_content',
      'footer_privacy_content',
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
      'feature_lanlink_enabled',
    ]),
    terms: new Set([
      'terms_required',
      'terms_updated_at',
      'terms_summary',
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
      { key: 'site_favicon_url', value: '', category: 'basic', description: 'Site favicon URL' },
      { key: 'sidebar_title', value: '', category: 'basic', description: 'Sidebar title' },
      { key: 'site_footer', value: '', category: 'basic', description: 'Footer text' },
      { key: 'footer_copyright', value: '', category: 'footer', description: 'Footer copyright text' },
      { key: 'footer_icp_number', value: '', category: 'footer', description: 'ICP filing number' },
      { key: 'footer_icp_url', value: '', category: 'footer', description: 'ICP filing link URL' },
      { key: 'footer_police_number', value: '', category: 'footer', description: 'Public security filing number' },
      { key: 'footer_police_url', value: '', category: 'footer', description: 'Public security filing link URL' },
      { key: 'footer_friendly_links', value: '[]', category: 'footer', description: 'Footer friendly links as JSON' },
      { key: 'footer_about_content', value: DEFAULT_ABOUT_CONTENT, category: 'footer', description: 'About page Markdown content' },
      { key: 'footer_thanks_content', value: DEFAULT_THANKS_CONTENT, category: 'footer', description: 'Thanks page Markdown content' },
      { key: 'footer_terms_content', value: DEFAULT_TERMS_CONTENT, category: 'footer', description: 'Terms page Markdown content' },
      { key: 'footer_privacy_content', value: DEFAULT_PRIVACY_CONTENT, category: 'footer', description: 'Privacy page Markdown content' },
      { key: 'brand_primary', value: DEFAULT_BRAND_PRIMARY, category: 'basic', description: 'Global primary brand color' },
      { key: 'brand_accent', value: DEFAULT_BRAND_ACCENT, category: 'basic', description: 'Global accent surface color' },
      { key: 'top_navigation_items', value: serializeTopNavigationItems(DEFAULT_TOP_NAVIGATION_ITEMS), category: 'navigation', description: 'Top navigation links and groups as JSON' },
      { key: 'site_url', value: process.env.FRONTEND_URL || 'http://localhost:3000', category: 'basic', description: '站点URL - 用于生成邮件链接、RSS订阅等，必须设置为实际运营域名' },
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
      { key: 'feature_lanlink_enabled', value: 'false', category: 'features', description: 'Enable LanLink game integration' },
      // Terms & Conditions enforcement
      { key: 'terms_required', value: 'false', category: 'terms', description: 'Require users to accept Terms & Privacy before forum access' },
      { key: 'terms_updated_at', value: new Date().toISOString(), category: 'terms', description: 'Bump to force all users to re-accept terms' },
      { key: 'terms_summary', value: '使用本站前请阅读并同意我们的服务条款与隐私政策。', category: 'terms', description: 'Short guidance text shown on the terms acceptance screen' },
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
   * Settings safe to serve to unauthenticated callers. Brand fields are always
   * present with empty-string defaults so the frontend receives a stable shape
   * even before the admin has configured them.
   */
  async getPublicSettings(): Promise<Record<string, string>> {
    const result: Record<string, string> = {};

    // Ensure all brand fields are present with empty defaults
    for (const key of SettingsService.BRAND_FIELDS) {
      result[key] = '';
    }

    // Populate with actual values from cache
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

  hasPublicKeys(keys: Iterable<string>): boolean {
    for (const key of keys) {
      if (SettingsService.PUBLIC_KEYS.has(key)) {
        return true;
      }
    }
    return false;
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
      if (key === 'footer_friendly_links') {
        normalizedValue = normalizeFooterFriendlyLinks(value);
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
