import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Setting } from '@entities/index';

@Injectable()
export class SettingsService implements OnModuleInit {
  private settingsCache: Map<string, Setting> = new Map();

  constructor(
    @InjectRepository(Setting)
    private settingRepository: Repository<Setting>,
  ) {}

  async onModuleInit() {
    await this.loadSettings();
  }

  /**
   * Seed default settings (INSERT IGNORE)
   */
  async seedDefaults(): Promise<void> {
    const defaults = [
      { key: 'site_name', value: 'MindFourm', category: 'general', description: 'Site name' },
      { key: 'site_description', value: 'Mindustry community forum', category: 'general', description: 'Site description' },
      { key: 'site_url', value: 'http://localhost:3000', category: 'general', description: 'Site URL' },
      { key: 'admin_email', value: 'admin@example.com', category: 'general', description: 'Admin email' },
      { key: 'maintenance_mode', value: 'false', category: 'general', description: 'Maintenance mode toggle' },
      { key: 'posts_per_page', value: '20', category: 'posts', description: 'Posts per page' },
      { key: 'max_post_length', value: '10000', category: 'posts', description: 'Maximum post length' },
      { key: 'allow_attachments', value: 'true', category: 'posts', description: 'Allow file attachments' },
      { key: 'require_approval', value: 'false', category: 'moderation', description: 'Require post approval' },
      { key: 'auto_approve_trusted', value: 'true', category: 'moderation', description: 'Auto-approve trusted users' },
      { key: 'cleanup_log_retention_days', value: '90', category: 'cleanup', description: 'Days to retain operation logs' },
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
        'INSERT IGNORE INTO settings (key, value, category, description) VALUES (?, ?, ?, ?)',
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
    for (const [, setting] of this.settingsCache) {
      if (setting.category === category) {
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

  /**
   * Batch update settings (upsert)
   */
  async setBatch(category: string, keyValuePairs: Record<string, string>): Promise<void> {
    for (const [key, value] of Object.entries(keyValuePairs)) {
      await this.settingRepository.query(
        'INSERT INTO settings (key, value, category, updated_at) VALUES (?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE value = ?, updated_at = NOW()',
        [key, value, category, value],
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
