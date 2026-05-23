const db = require('../database');

const DEFAULT_SETTINGS = {
  site_name: 'MindForum',
  site_tagline: 'Share ideas, exchange experience',
  site_description: 'A community for technical discussion and knowledge sharing.',
  site_logo_url: '',
  site_footer: '© 2026 MindForum',
  announce_enabled: 'true',
  announce_content: '',
  posts_per_page: '20',
  default_sort: 'newest',
  replies_per_page: '50',
  seo_title_suffix: ' | MindForum',
  seo_default_description: 'MindForum - A community for technical discussion',
  seo_og_image: '',
  seo_sitemap_enabled: 'true',
  seo_robots_enabled: 'true',
  title_min_length: '2',
  title_max_length: '200',
  content_min_length: '10',
  max_tags_per_post: '5',
  max_tag_length: '30',
  rate_post_max: '10',
  rate_post_window_min: '60',
  rate_reply_max: '30',
  rate_reply_window_min: '60',
  rate_reply_newuser_cooldown_sec: '300',
  rate_login_max: '5',
  rate_login_lock_min: '15',
  rate_api_max: '100',
  cleanup_log_retention_days: '90',
  cleanup_soft_delete_retention_days: '30',
  cleanup_session_ttl_hours: '24',
  smtp_host: '',
  smtp_port: '587',
  smtp_user: '',
  smtp_pass: '',
  smtp_from: '',
  site_url: 'http://localhost:3000',
};

const CATEGORY_KEYS = {
  basic: ['site_name', 'site_tagline', 'site_description', 'site_logo_url', 'site_footer'],
  announce: ['announce_enabled', 'announce_content'],
  display: ['posts_per_page', 'default_sort', 'replies_per_page'],
  seo: ['seo_title_suffix', 'seo_default_description', 'seo_og_image', 'seo_sitemap_enabled', 'seo_robots_enabled'],
  rules: ['title_min_length', 'title_max_length', 'content_min_length', 'max_tags_per_post', 'max_tag_length'],
  rate_limit: ['rate_post_max', 'rate_post_window_min', 'rate_reply_max', 'rate_reply_window_min', 'rate_reply_newuser_cooldown_sec', 'rate_login_max', 'rate_login_lock_min', 'rate_api_max'],
  cleanup: ['cleanup_log_retention_days', 'cleanup_soft_delete_retention_days', 'cleanup_session_ttl_hours'],
  email: ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from', 'site_url'],
};

class SettingService {
  static async seedDefaults() {
    for (const [category, keys] of Object.entries(CATEGORY_KEYS)) {
      for (const key of keys) {
        try {
          await db.execute(
            'INSERT IGNORE INTO settings (`key`, value, category, description) VALUES (?, ?, ?, ?)',
            [key, DEFAULT_SETTINGS[key], category, null]
          );
        } catch (err) {
          // Ignore duplicate errors
        }
      }
    }
  }

  static async getByCategory(category) {
    const keys = CATEGORY_KEYS[category];
    if (!keys) return {};

    const rows = await db.query(
      'SELECT `key`, value FROM settings WHERE `key` IN (' + keys.map(() => '?').join(',') + ')',
      keys
    );

    const result = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }

    for (const key of keys) {
      if (!(key in result)) {
        result[key] = DEFAULT_SETTINGS[key];
      }
    }

    return result;
  }

  static async getAll() {
    const rows = await db.query('SELECT `key`, value, category FROM settings ORDER BY category, `key`');
    const result = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }

    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      if (!(key in result)) {
        result[key] = value;
      }
    }

    return result;
  }

  static async setBatch(category, keyValuePairs) {
    for (const [key, value] of Object.entries(keyValuePairs)) {
      await db.execute(
        'INSERT INTO settings (`key`, value, category, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE value = ?, updated_at = CURRENT_TIMESTAMP',
        [key, String(value), category, String(value)]
      );
    }

    return this.getByCategory(category);
  }

  static async get(key) {
    const row = await db.queryOne('SELECT value FROM settings WHERE `key` = ?', [key]);
    if (row) return row.value;
    return DEFAULT_SETTINGS[key] ?? null;
  }

  static async getNumber(key) {
    const val = await this.get(key);
    if (val === null) return null;
    const num = Number(val);
    return isNaN(num) ? null : num;
  }
}

module.exports = SettingService;