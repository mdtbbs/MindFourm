import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSearchAudits1720000058000 implements MigrationInterface {
  name = 'CreateSearchAudits1720000058000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS search_audits (
        id INT NOT NULL AUTO_INCREMENT,
        user_id INT NOT NULL,
        username_snapshot VARCHAR(100) NOT NULL,
        query VARCHAR(255) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'started',
        blocked_reason VARCHAR(50) NULL,
        results_count INT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME NULL,
        PRIMARY KEY (id),
        INDEX idx_search_audits_user_created (user_id, created_at),
        INDEX idx_search_audits_query_created (query, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  async down(): Promise<void> {
    // This audit table is intentionally retained on rollback.
  }
}
