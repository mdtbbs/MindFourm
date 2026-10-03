import { MigrationInterface, QueryRunner } from 'typeorm';

/** Durable one-hour view de-duplication and privacy-reduced resource analytics. */
export class ResourceViewsAnalytics1720000200000 implements MigrationInterface {
  name = 'ResourceViewsAnalytics1720000200000';
  transaction = false;

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS resource_view_events (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        resource_id INT UNSIGNED NOT NULL,
        visitor_hash CHAR(64) NOT NULL,
        user_id INT UNSIGNED NULL,
        referrer_category VARCHAR(32) NOT NULL,
        created_at DATETIME NOT NULL,
        PRIMARY KEY (id),
        INDEX idx_resource_view_events_resource_created (resource_id, created_at),
        INDEX idx_resource_view_events_visitor_created (visitor_hash, created_at),
        INDEX idx_resource_view_events_referrer_created (referrer_category, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS resource_view_dedup (
        dedup_key CHAR(64) NOT NULL,
        last_viewed_at DATETIME NOT NULL,
        PRIMARY KEY (dedup_key),
        INDEX idx_resource_view_dedup_expiry (last_viewed_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS resource_view_dedup');
    await queryRunner.query('DROP TABLE IF EXISTS resource_view_events');
  }
}
