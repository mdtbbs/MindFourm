import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMobileAuth1720000047000 implements MigrationInterface {
  name = 'CreateMobileAuth1720000047000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS mobile_sessions (id CHAR(36) NOT NULL, user_id INT NOT NULL, device_name VARCHAR(128) NOT NULL, ip_address VARCHAR(45) NULL, user_agent TEXT NULL, last_seen_at DATETIME NULL, revoked_at DATETIME NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY (id), KEY idx_mobile_sessions_user_active (user_id, revoked_at), CONSTRAINT fk_mobile_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS mobile_refresh_tokens (id CHAR(36) NOT NULL, session_id CHAR(36) NOT NULL, family_id CHAR(36) NOT NULL, token_hash CHAR(64) NOT NULL, replaced_by_id CHAR(36) NULL, expires_at DATETIME NOT NULL, revoked_at DATETIME NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id), UNIQUE KEY uq_mobile_refresh_tokens_hash (token_hash), KEY idx_mobile_refresh_tokens_family_active (family_id, revoked_at), CONSTRAINT fk_mobile_refresh_tokens_session FOREIGN KEY (session_id) REFERENCES mobile_sessions(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }
  async down(): Promise<void> { /* Security audit data is deliberately retained on rollback. */ }
}
