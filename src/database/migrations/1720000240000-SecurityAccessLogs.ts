import { MigrationInterface, QueryRunner } from 'typeorm';

export class SecurityAccessLogs1720000240000 implements MigrationInterface {
  name = 'SecurityAccessLogs1720000240000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS security_access_logs (
        id INT NOT NULL AUTO_INCREMENT,
        request_id VARCHAR(80) NOT NULL,
        user_id INT NULL,
        method VARCHAR(12) NOT NULL,
        route VARCHAR(255) NOT NULL,
        resource_type VARCHAR(40) NULL,
        resource_id VARCHAR(100) NULL,
        ip_address VARCHAR(45) NULL,
        user_agent VARCHAR(512) NULL,
        status_code SMALLINT UNSIGNED NOT NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY idx_security_access_logs_created_at (created_at),
        KEY idx_security_access_logs_request_id (request_id),
        KEY idx_security_access_logs_user_created (user_id, created_at),
        KEY idx_security_access_logs_resource (resource_type, resource_id, created_at),
        KEY idx_security_access_logs_status_created (status_code, created_at),
        KEY idx_security_access_logs_ip_created (ip_address, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  async down(): Promise<void> {
    // Access logs are security evidence; rollback must not erase collected rows.
    throw new Error('Refusing to drop security_access_logs because it contains retained security audit data');
  }
}
