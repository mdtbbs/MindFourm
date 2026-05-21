const db = require('../database');

const DEFAULT_SETTINGS = {
  // Basic
  site_name: 'MindForum',
  site_tagline: 'Share ideas, exchange experience',
  site_description: 'A community for technical discussion and knowledge sharing.',
  site_logo_url: '',
  site_footer: '© 2026 MindForum',
  // Announce
  announce_enabled: 'true',
  announce_content: '',
  // Display
  posts_per_page: '20',
  default_sort: 'newest',
  replies_per_page: '50',
  // SEO
  seo_title_suffix: ' | MindForum',
  seo_default_description: 'MindForum - A community for technical discussion',
  seo_og_image: '',
  seo_sitemap_enabled: 'true',
  seo_robots_enabled: 'true',
  // Rules
  title_min_length: '2',
  title_max_length: '200',
  content_min_length: '10',
  max_tags_per_post: '5',
  max_tag_length: '30',
  // Rate limits
  rate_post_max: '10',
  rate_post_window_min: '60',
  rate_reply_max: '30',
  rate_reply_window_min: '60',
  rate_reply_newuser_cooldown_sec: '300',
  rate_login_max: '5',
  rate_login_lock_min: '15',
  rate_api_max: '100',
  // Cleanup
  cleanup_log_retention_days: '90',
  cleanup_soft_delete_retention_days: '30',
  cleanup_session_ttl_hours: '24',
  // Email
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
  static seedDefaults() {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO settings (key, value, category, description) VALUES (?, ?, ?, ?)
    `);
    db.transaction(() => {
      for (const [category, keys] of Object.entries(CATEGORY_KEYS)) {
        for (const key of keys) {
          stmt.run(key, DEFAULT_SETTINGS[key], category, null);
        }
      }
    })();
  }

  static getByCategory(category) {
    const keys = CATEGORY_KEYS[category];
    if (!keys) return {};

    const rows = db.prepare('SELECT key, value FROM settings WHERE key IN (' + keys.map(() => '?').join(',') + ')').all(...keys);

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

  static getAll() {
    const rows = db.prepare('SELECT key, value, category FROM settings ORDER BY category, key').all();
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

  static setBatch(category, keyValuePairs) {
    const stmt = db.prepare(`
      INSERT INTO settings (key, value, category, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `);

    db.transaction(() => {
      for (const [key, value] of Object.entries(keyValuePairs)) {
        stmt.run(key, String(value), category);
      }
    })();

    return this.getByCategory(category);
  }

  static get(key) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    if (row) return row.value;
    return DEFAULT_SETTINGS[key] ?? null;
  }

  static getNumber(key) {
    const val = this.get(key);
    if (val === null) return null;
    const num = Number(val);
    return isNaN(num) ? null : num;
  }
}

module.exports = SettingService;
