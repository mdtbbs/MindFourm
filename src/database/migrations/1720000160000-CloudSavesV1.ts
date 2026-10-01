import { MigrationInterface, QueryRunner } from 'typeorm';

export class CloudSavesV11720000160000 implements MigrationInterface {
  name = 'CloudSavesV11720000160000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE game_save_slots (
      id CHAR(36) NOT NULL, user_id INT NOT NULL, name VARCHAR(100) NOT NULL,
      current_snapshot_id CHAR(36) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deleted_at DATETIME NULL, PRIMARY KEY (id),
      KEY idx_game_save_slots_user (user_id), KEY idx_game_save_slots_user_updated (user_id, updated_at),
      CONSTRAINT fk_game_save_slot_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await queryRunner.query(`CREATE TABLE game_save_blobs (
      id CHAR(36) NOT NULL, user_id INT NOT NULL, sha256 CHAR(64) NOT NULL,
      size_bytes BIGINT UNSIGNED NOT NULL, storage_provider VARCHAR(32) NOT NULL,
      object_key VARCHAR(512) NOT NULL, ref_count INT UNSIGNED NOT NULL DEFAULT 0,
      gc_in_progress TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_referenced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, pending_delete_at DATETIME NULL,
      PRIMARY KEY (id), UNIQUE KEY uq_game_save_blob_user_sha_size (user_id, sha256, size_bytes),
      KEY idx_game_save_blobs_ref_gc (ref_count, pending_delete_at),
      CONSTRAINT fk_game_save_blob_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await queryRunner.query(`CREATE TABLE game_save_snapshots (
      id CHAR(36) NOT NULL, slot_id CHAR(36) NOT NULL, revision INT UNSIGNED NOT NULL,
      blob_id CHAR(36) NOT NULL, sha256 CHAR(64) NOT NULL, size_bytes BIGINT UNSIGNED NOT NULL,
      game_version VARCHAR(32) NULL, game_build INT UNSIGNED NULL, map_name VARCHAR(160) NULL,
      wave INT UNSIGNED NULL, playtime_seconds BIGINT UNSIGNED NULL, mods_manifest_json JSON NULL,
      mods_manifest_hash CHAR(64) NULL, created_by_client_id VARCHAR(128) NULL, device_id VARCHAR(128) NULL,
      reason ENUM('manual','before_launch','after_exit','periodic','restore','conflict','import') NOT NULL,
      base_snapshot_id CHAR(36) NULL, is_pinned TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, deleted_at DATETIME NULL,
      PRIMARY KEY (id), UNIQUE KEY uq_game_save_snapshot_slot_revision (slot_id, revision),
      KEY idx_game_save_snapshot_slot_created (slot_id, created_at),
      KEY idx_game_save_snapshot_slot_sha (slot_id, sha256), KEY idx_game_save_snapshot_created (created_at),
      KEY idx_game_save_snapshot_pinned (is_pinned), KEY idx_game_save_snapshot_blob (blob_id),
      CONSTRAINT fk_game_save_snapshot_slot FOREIGN KEY (slot_id) REFERENCES game_save_slots(id) ON DELETE CASCADE,
      CONSTRAINT fk_game_save_snapshot_blob FOREIGN KEY (blob_id) REFERENCES game_save_blobs(id) ON DELETE RESTRICT,
      CONSTRAINT fk_game_save_snapshot_base FOREIGN KEY (base_snapshot_id) REFERENCES game_save_snapshots(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await queryRunner.query(`ALTER TABLE game_save_slots
      ADD KEY idx_game_save_slots_current_snapshot (current_snapshot_id),
      ADD CONSTRAINT fk_game_save_slot_current_snapshot FOREIGN KEY (current_snapshot_id) REFERENCES game_save_snapshots(id) ON DELETE SET NULL`);
    await queryRunner.query(`CREATE TABLE game_save_upload_sessions (
      id CHAR(36) NOT NULL, user_id INT NOT NULL, slot_id CHAR(36) NOT NULL,
      expected_sha256 CHAR(64) NOT NULL, expected_size_bytes BIGINT UNSIGNED NOT NULL,
      game_version VARCHAR(32) NULL, game_build INT UNSIGNED NULL, map_name VARCHAR(160) NULL,
      wave INT UNSIGNED NULL, playtime_seconds BIGINT UNSIGNED NULL, mods_manifest_json JSON NULL,
      mods_manifest_hash CHAR(64) NULL, base_snapshot_id CHAR(36) NULL,
      reason ENUM('manual','before_launch','after_exit','periodic','restore','conflict','import') NOT NULL,
      conflict_resolution ENUM('normal','create_conflict_copy','force_replace_head') NOT NULL DEFAULT 'normal',
      confirm_current_snapshot_id CHAR(36) NULL, object_key VARCHAR(512) NOT NULL, storage_provider VARCHAR(32) NOT NULL,
      status ENUM('pending','uploaded','committed','expired','cancelled','failed') NOT NULL DEFAULT 'pending',
      created_by_client_id VARCHAR(128) NULL, device_id VARCHAR(128) NULL, expires_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, committed_at DATETIME NULL,
      committed_snapshot_id CHAR(36) NULL, object_deleted_at DATETIME NULL, PRIMARY KEY (id),
      KEY idx_game_save_upload_user (user_id), KEY idx_game_save_upload_slot (slot_id),
      KEY idx_game_save_upload_expiry (expires_at), KEY idx_game_save_upload_status (status),
      KEY idx_game_save_upload_committed_snapshot (committed_snapshot_id),
      CONSTRAINT fk_game_save_upload_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_game_save_upload_slot FOREIGN KEY (slot_id) REFERENCES game_save_slots(id) ON DELETE CASCADE,
      CONSTRAINT fk_game_save_upload_base FOREIGN KEY (base_snapshot_id) REFERENCES game_save_snapshots(id) ON DELETE SET NULL,
      CONSTRAINT fk_game_save_upload_committed_snapshot FOREIGN KEY (committed_snapshot_id) REFERENCES game_save_snapshots(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await queryRunner.query(`CREATE TABLE game_save_idempotency (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT, user_id INT NOT NULL, operation VARCHAR(64) NOT NULL,
      idempotency_key VARCHAR(128) NOT NULL, request_sha256 CHAR(64) NOT NULL, response_json LONGTEXT NULL,
      expires_at DATETIME NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id), UNIQUE KEY uq_game_save_idempotency_scope (user_id, operation, idempotency_key),
      KEY idx_game_save_idempotency_expiry (expires_at),
      CONSTRAINT fk_game_save_idempotency_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS game_save_idempotency');
    await queryRunner.query('DROP TABLE IF EXISTS game_save_upload_sessions');
    await queryRunner.query('ALTER TABLE game_save_slots DROP FOREIGN KEY fk_game_save_slot_current_snapshot');
    await queryRunner.query('DROP TABLE IF EXISTS game_save_snapshots');
    await queryRunner.query('DROP TABLE IF EXISTS game_save_blobs');
    await queryRunner.query('DROP TABLE IF EXISTS game_save_slots');
  }
}
