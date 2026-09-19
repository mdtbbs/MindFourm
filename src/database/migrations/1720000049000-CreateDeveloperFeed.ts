import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDeveloperFeed1720000049000 implements MigrationInterface {
  name = 'CreateDeveloperFeed1720000049000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS service_accounts (
      id INT AUTO_INCREMENT PRIMARY KEY, slug VARCHAR(80) NOT NULL, display_name VARCHAR(120) NOT NULL,
      kind VARCHAR(40) NOT NULL, is_active TINYINT NOT NULL DEFAULT 1,
      created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      UNIQUE KEY uq_service_accounts_slug (slug)
    )`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS developer_feed_entries (
      id INT AUTO_INCREMENT PRIMARY KEY, provider VARCHAR(40) NOT NULL, repository VARCHAR(255) NOT NULL,
      item_type VARCHAR(40) NOT NULL, external_id VARCHAR(100) NOT NULL, state VARCHAR(40) NOT NULL, service_account_id INT NULL,
      author_login VARCHAR(255) NOT NULL, author_display_name VARCHAR(255) NULL, author_avatar_url VARCHAR(500) NULL,
      source_url VARCHAR(500) NOT NULL, summary VARCHAR(500) NULL, is_low_value TINYINT NOT NULL DEFAULT 0,
      is_indexable TINYINT NOT NULL DEFAULT 1, opened_at DATETIME NULL, closed_at DATETIME NULL, merged_at DATETIME NULL,
      created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      UNIQUE KEY uq_developer_feed_source (provider, repository, item_type, external_id), INDEX idx_developer_feed_created (created_at)
    )`);
  }
  async down(queryRunner: QueryRunner): Promise<void> { await queryRunner.query('DROP TABLE IF EXISTS developer_feed_entries'); await queryRunner.query('DROP TABLE IF EXISTS service_accounts'); }
}
