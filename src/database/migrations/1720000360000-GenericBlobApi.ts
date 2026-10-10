import { MigrationInterface, QueryRunner } from 'typeorm';
import { tableExists } from './migration-utils';

/**
 * Generic blob storage: content-addressed objects, named bindings, upload
 * sessions and the idempotency replay store.
 *
 * Every statement is guarded by `tableExists` because migrations run during
 * `DataSource.initialize()`: a fresh database materialises these tables from the
 * baseline synchronize path, an existing one gets them here, and both have to
 * converge without a duplicate-table error taking the boot down.
 */
export class GenericBlobApi1720000360000 implements MigrationInterface {
  name = 'GenericBlobApi1720000360000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await tableExists(queryRunner, 'blob_objects'))) {
      await queryRunner.query(`CREATE TABLE blob_objects (
        id CHAR(36) NOT NULL,
        namespace VARCHAR(64) NOT NULL,
        owner_type VARCHAR(32) NOT NULL DEFAULT 'user',
        owner_id VARCHAR(64) NOT NULL,
        sha256 CHAR(64) NOT NULL,
        size_bytes BIGINT UNSIGNED NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        storage_provider VARCHAR(32) NOT NULL,
        object_key VARCHAR(512) NOT NULL,
        ref_count INT UNSIGNED NOT NULL DEFAULT 0,
        gc_in_progress TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_referenced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        pending_delete_at DATETIME NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_blob_object_owner_content (namespace, owner_type, owner_id, sha256, size_bytes),
        KEY idx_blob_objects_ref_gc (ref_count, pending_delete_at),
        KEY idx_blob_objects_namespace_created (namespace, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    }

    if (!(await tableExists(queryRunner, 'blob_records'))) {
      await queryRunner.query(`CREATE TABLE blob_records (
        id CHAR(36) NOT NULL,
        namespace VARCHAR(64) NOT NULL,
        owner_type VARCHAR(32) NOT NULL DEFAULT 'user',
        owner_id VARCHAR(64) NOT NULL,
        blob_key VARCHAR(255) NOT NULL,
        object_id CHAR(36) NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        size_bytes BIGINT UNSIGNED NOT NULL,
        sha256 CHAR(64) NOT NULL,
        visibility VARCHAR(16) NOT NULL DEFAULT 'private',
        status VARCHAR(16) NOT NULL DEFAULT 'active',
        metadata_json JSON NULL,
        tags_json JSON NULL,
        ref_type VARCHAR(32) NULL,
        ref_id VARCHAR(64) NULL,
        expires_at DATETIME NULL,
        created_by_user_id INT NULL,
        active_slot SMALLINT UNSIGNED NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at DATETIME NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_blob_record_owner_key (namespace, owner_type, owner_id, blob_key, active_slot),
        KEY idx_blob_records_owner_created (owner_type, owner_id, created_at),
        KEY idx_blob_records_ref (ref_type, ref_id),
        KEY idx_blob_records_expiry (expires_at),
        KEY idx_blob_records_object (object_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    }

    if (!(await tableExists(queryRunner, 'blob_upload_sessions'))) {
      await queryRunner.query(`CREATE TABLE blob_upload_sessions (
        id CHAR(36) NOT NULL,
        owner_type VARCHAR(32) NOT NULL DEFAULT 'user',
        owner_id VARCHAR(64) NOT NULL,
        user_id INT NULL,
        namespace VARCHAR(64) NOT NULL,
        blob_key VARCHAR(255) NOT NULL,
        expected_sha256 CHAR(64) NOT NULL,
        expected_size_bytes BIGINT UNSIGNED NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        visibility VARCHAR(16) NOT NULL DEFAULT 'private',
        metadata_json JSON NULL,
        tags_json JSON NULL,
        ref_type VARCHAR(32) NULL,
        ref_id VARCHAR(64) NULL,
        object_id CHAR(36) NULL,
        object_key VARCHAR(512) NOT NULL,
        storage_provider VARCHAR(32) NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'pending',
        expires_at DATETIME NOT NULL,
        record_expires_at DATETIME NULL,
        committed_at DATETIME NULL,
        committed_blob_id CHAR(36) NULL,
        object_deleted_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_blob_upload_owner (owner_type, owner_id),
        KEY idx_blob_upload_expiry (expires_at),
        KEY idx_blob_upload_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    }

    if (!(await tableExists(queryRunner, 'blob_idempotency'))) {
      await queryRunner.query(`CREATE TABLE blob_idempotency (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        owner_type VARCHAR(32) NOT NULL DEFAULT 'user',
        owner_id VARCHAR(64) NOT NULL,
        operation VARCHAR(64) NOT NULL,
        idempotency_key VARCHAR(128) NOT NULL,
        request_sha256 CHAR(64) NOT NULL,
        response_json LONGTEXT NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_blob_idempotency_scope (owner_type, owner_id, operation, idempotency_key),
        KEY idx_blob_idempotency_expiry (expires_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS blob_idempotency');
    await queryRunner.query('DROP TABLE IF EXISTS blob_upload_sessions');
    await queryRunner.query('DROP TABLE IF EXISTS blob_records');
    await queryRunner.query('DROP TABLE IF EXISTS blob_objects');
  }
}
