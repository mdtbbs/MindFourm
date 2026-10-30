import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * File-level delta cloud saves.
 *
 * Whole-package snapshots keep their single `blob_id`; manifest snapshots are a
 * set of file rows that each reference an existing content-addressed blob. The
 * blob table already models per-user dedupe (sha256 + size), reference counts
 * and delayed GC, so this migration only adds the missing snapshot shape and
 * the staging table for standalone blob uploads.
 */
export class CloudSaveManifestSnapshots1720000400000 implements MigrationInterface {
  name = 'CloudSaveManifestSnapshots1720000400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE game_save_snapshots
      MODIFY COLUMN blob_id CHAR(36) NULL,
      ADD COLUMN format ENUM('zip','manifest') NOT NULL DEFAULT 'zip' AFTER revision,
      ADD COLUMN manifest_file_count INT UNSIGNED NULL AFTER size_bytes`);

    await queryRunner.query(`CREATE TABLE game_save_snapshot_files (
      id CHAR(36) NOT NULL,
      snapshot_id CHAR(36) NOT NULL,
      path VARCHAR(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
      blob_id CHAR(36) NOT NULL,
      size_bytes BIGINT UNSIGNED NOT NULL,
      sha256 CHAR(64) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_game_save_snapshot_file_path (snapshot_id, path),
      KEY idx_game_save_snapshot_files_blob (blob_id),
      CONSTRAINT fk_game_save_snapshot_file_snapshot FOREIGN KEY (snapshot_id) REFERENCES game_save_snapshots(id) ON DELETE CASCADE,
      CONSTRAINT fk_game_save_snapshot_file_blob FOREIGN KEY (blob_id) REFERENCES game_save_blobs(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await queryRunner.query(`CREATE TABLE game_save_blob_uploads (
      id CHAR(36) NOT NULL,
      user_id INT NOT NULL,
      sha256 CHAR(64) NOT NULL,
      size_bytes BIGINT UNSIGNED NOT NULL,
      object_key VARCHAR(512) NOT NULL,
      storage_provider VARCHAR(32) NOT NULL,
      status ENUM('pending','ready','committed','expired','failed') NOT NULL DEFAULT 'pending',
      committed_blob_id CHAR(36) NULL,
      created_by_client_id VARCHAR(128) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      object_deleted_at DATETIME NULL,
      PRIMARY KEY (id),
      KEY idx_game_save_blob_uploads_owner_status (user_id, status, expires_at),
      KEY idx_game_save_blob_uploads_hash (user_id, sha256, size_bytes),
      CONSTRAINT fk_game_save_blob_upload_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query('SELECT COUNT(*) AS count FROM game_save_snapshots WHERE blob_id IS NULL');
    if (Number((rows as any[])?.[0]?.count || 0) > 0) {
      // Check before any DDL: MySQL DDL implicitly commits, so dropping the
      // child tables first would leave a half-reverted schema behind. Manifest
      // snapshots have no whole-package blob to fall back to, so require an
      // explicit operator decision instead of guessing.
      throw new Error('Cannot revert CloudSaveManifestSnapshots while manifest snapshots exist');
    }
    await queryRunner.query('DROP TABLE IF EXISTS game_save_blob_uploads');
    await queryRunner.query('DROP TABLE IF EXISTS game_save_snapshot_files');
    await queryRunner.query('ALTER TABLE game_save_snapshots DROP COLUMN manifest_file_count, DROP COLUMN format, MODIFY COLUMN blob_id CHAR(36) NOT NULL');
  }
}
