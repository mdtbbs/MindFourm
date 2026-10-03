import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  addColumnIfMissing,
  addForeignKeyIfMissing,
  columnExists,
  createIndexIfMissing,
  tableExists,
} from './migration-utils';
import { resolvePublicSiteUrl, validateConfiguredPublicSiteUrl } from '../../common/utils/public-site-url.util';

export class EmailDeliveryHardening1720000240000 implements MigrationInterface {
  name = 'EmailDeliveryHardening1720000240000';
  transaction = false;

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await tableExists(queryRunner, 'users')) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS email_logs (
          id INT NOT NULL AUTO_INCREMENT,
          user_id INT NULL,
          email_type VARCHAR(50) NOT NULL,
          to_email VARCHAR(255) NOT NULL,
          subject VARCHAR(255) NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'queued',
          error_message TEXT NULL,
          queued_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          sent_at DATETIME(6) NULL,
          failed_at DATETIME(6) NULL,
          attempts INT NOT NULL DEFAULT 0,
          provider_message_id VARCHAR(255) NULL,
          PRIMARY KEY (id),
          KEY idx_email_logs_user_id (user_id),
          KEY idx_email_logs_status (status),
          KEY idx_email_logs_queued_at (queued_at),
          KEY idx_email_logs_sent_at (sent_at),
          CONSTRAINT fk_email_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    }

    if (await tableExists(queryRunner, 'email_logs')) {
      const hadQueuedAt = await columnExists(queryRunner, 'email_logs', 'queued_at');
      await addColumnIfMissing(queryRunner, 'email_logs', 'queued_at', 'DATETIME(6) NULL');
      await addColumnIfMissing(queryRunner, 'email_logs', 'failed_at', 'DATETIME(6) NULL');
      await addColumnIfMissing(queryRunner, 'email_logs', 'attempts', 'INT NOT NULL DEFAULT 0');
      await addColumnIfMissing(queryRunner, 'email_logs', 'provider_message_id', 'VARCHAR(255) NULL');

      if (await columnExists(queryRunner, 'email_logs', 'sent_at')) {
        await queryRunner.query('ALTER TABLE email_logs MODIFY COLUMN sent_at DATETIME(6) NULL DEFAULT NULL');
      }
      if (!hadQueuedAt) {
        await queryRunner.query('UPDATE email_logs SET queued_at = COALESCE(sent_at, CURRENT_TIMESTAMP(6)) WHERE queued_at IS NULL');
      }
      await queryRunner.query("UPDATE email_logs SET failed_at = COALESCE(failed_at, queued_at) WHERE status = 'failed' AND failed_at IS NULL");
      await queryRunner.query("UPDATE email_logs SET sent_at = NULL WHERE status <> 'sent'");
      await queryRunner.query("UPDATE email_logs SET attempts = 1 WHERE attempts = 0 AND status IN ('sent', 'failed')");
      await queryRunner.query("ALTER TABLE email_logs MODIFY COLUMN status VARCHAR(20) NOT NULL DEFAULT 'queued'");
      await queryRunner.query('ALTER TABLE email_logs MODIFY COLUMN queued_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)');

      await createIndexIfMissing(queryRunner, 'email_logs', 'idx_email_logs_user_id', ['user_id']);
      await createIndexIfMissing(queryRunner, 'email_logs', 'idx_email_logs_status', ['status']);
      await createIndexIfMissing(queryRunner, 'email_logs', 'idx_email_logs_queued_at', ['queued_at']);
      await createIndexIfMissing(queryRunner, 'email_logs', 'idx_email_logs_sent_at', ['sent_at']);
      await addForeignKeyIfMissing(queryRunner, 'email_logs', 'fk_email_logs_user', 'user_id', 'users', 'id', 'SET NULL');
    }

    if (await tableExists(queryRunner, 'settings')) {
      const siteRows = await queryRunner.query("SELECT value FROM settings WHERE `key` = 'site_url' LIMIT 1");
      const currentSiteUrl = String(siteRows[0]?.value || '');
      let unsafeSiteUrl = false;
      if (currentSiteUrl) {
        try {
          validateConfiguredPublicSiteUrl(currentSiteUrl, 'production');
        } catch {
          unsafeSiteUrl = true;
        }
      }
      if (unsafeSiteUrl) {
        const profile = String(process.env.SITE_PROFILE || 'mdtbbs').toLowerCase();
        const profileDomain = profile === 'mindustry-club' ? 'mindustry.club' : 'mdtbbs.cn';
        const repaired = resolvePublicSiteUrl({
          envUrl: process.env.FRONTEND_URL,
          profileDomain,
          nodeEnv: 'production',
        });
        await queryRunner.query(
          "UPDATE settings SET value = ?, updated_at = NOW() WHERE `key` = 'site_url'",
          [repaired],
        );
      }

      const portRows = await queryRunner.query("SELECT value FROM settings WHERE `key` = 'smtp_port' LIMIT 1");
      if (String(portRows[0]?.value || '587') === '587') {
        await queryRunner.query(
          "UPDATE settings SET value = 'false', updated_at = NOW() WHERE `key` = 'smtp_secure' AND value = 'true'",
        );
      }
    }
  }

  async down(): Promise<void> {
    // Delivery audit columns and repaired public URLs are intentionally retained.
    // Removing them would re-introduce the production failure this migration fixes.
  }
}
