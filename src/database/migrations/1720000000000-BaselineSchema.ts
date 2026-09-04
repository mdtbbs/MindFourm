import { MigrationInterface, QueryRunner } from 'typeorm';
import { addColumnIfMissing, hasAnyBaseTables, tableExists } from './migration-utils';

/**
 * Baseline: bring any database — empty or long-lived — up to the schema the
 * entities describe.
 *
 * Two starting points have to be handled. An empty schema is materialised
 * straight from entity metadata, which is the only description of the current
 * schema that is actually authoritative. A database that predates this migration
 * system was built by earlier synchronize runs plus the hand-rolled patch calls
 * that used to live in `database.module.ts`; those calls are reproduced here so
 * such databases converge on the same shape.
 */
export class BaselineSchema1720000000000 implements MigrationInterface {
  name = 'BaselineSchema1720000000000';

  /**
   * `connection.synchronize()` opens its own query runner, and MySQL commits DDL
   * implicitly anyway, so wrapping this in a transaction would only hold a second
   * connection open for the duration.
   */
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await hasAnyBaseTables(queryRunner))) {
      await queryRunner.connection.synchronize(false);
      return;
    }

    await this.ensureResourceTables(queryRunner);
    await this.ensureAdminNotificationTables(queryRunner);
    await this.ensureColumns(queryRunner);
  }

  public async down(): Promise<void> {
    // A baseline has no meaningful inverse: reverting it would drop every table in
    // the database. Restore from a backup instead.
    throw new Error('BaselineSchema cannot be reverted — restore from a backup.');
  }

  private async ensureResourceTables(queryRunner: QueryRunner): Promise<void> {
    if (!(await tableExists(queryRunner, 'users'))) return;

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS resource_categories (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(255) NOT NULL UNIQUE,
        description TEXT,
        icon VARCHAR(50),
        sort_order INT DEFAULT 0,
        is_active TINYINT DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_resource_categories_slug (slug),
        INDEX idx_resource_categories_active (is_active)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS resources (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        resource_type VARCHAR(50) NOT NULL DEFAULT 'upload',
        file_name VARCHAR(255),
        file_path VARCHAR(500),
        file_size INT NULL,
        mime_type VARCHAR(100),
        external_url VARCHAR(500),
        version VARCHAR(50),
        content TEXT,
        content_html TEXT,
        category_id INT NULL,
        download_count INT DEFAULT 0,
        is_public TINYINT DEFAULT 0,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES resource_categories(id) ON DELETE SET NULL,
        INDEX idx_resources_user (user_id),
        INDEX idx_resources_status (status),
        INDEX idx_resources_public (is_public, status),
        INDEX idx_resources_created (created_at DESC),
        INDEX idx_resources_category (category_id),
        INDEX idx_resources_type (resource_type)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS resource_versions (
        id INT PRIMARY KEY AUTO_INCREMENT,
        resource_id INT NOT NULL,
        version VARCHAR(50) NOT NULL,
        file_path VARCHAR(500),
        file_name VARCHAR(255),
        file_size INT,
        mime_type VARCHAR(100),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
        UNIQUE KEY unique_version (resource_id, version),
        INDEX idx_resource_versions_resource (resource_id)
      )
    `);
  }

  private async ensureAdminNotificationTables(queryRunner: QueryRunner): Promise<void> {
    if (!(await tableExists(queryRunner, 'users'))) return;

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS admin_notifications (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        event_key VARCHAR(100) NOT NULL,
        category VARCHAR(50) NOT NULL,
        level VARCHAR(30) NOT NULL DEFAULT 'info',
        title VARCHAR(255) NOT NULL,
        content TEXT NULL,
        action_url VARCHAR(500) NULL,
        metadata_json TEXT NULL,
        is_read TINYINT(1) NOT NULL DEFAULT 0,
        read_at DATETIME NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_admin_notifications_user_read (user_id, is_read),
        INDEX idx_admin_notifications_user_created (user_id, created_at DESC),
        INDEX idx_admin_notifications_event_key (event_key)
      )
    `);
  }

  private async ensureColumns(queryRunner: QueryRunner): Promise<void> {
    await addColumnIfMissing(queryRunner, 'users', 'total_points', 'INT NOT NULL DEFAULT 0');
    await addColumnIfMissing(queryRunner, 'users', 'available_points', 'INT NOT NULL DEFAULT 0');
    await addColumnIfMissing(queryRunner, 'users', 'reply_email', 'TINYINT(1) NOT NULL DEFAULT 1');
    await addColumnIfMissing(queryRunner, 'users', 'mention_email', 'TINYINT(1) NOT NULL DEFAULT 1');
    await addColumnIfMissing(queryRunner, 'users', 'message_email', 'TINYINT(1) NOT NULL DEFAULT 1');
    await addColumnIfMissing(queryRunner, 'users', 'system_email', 'TINYINT(1) NOT NULL DEFAULT 1');
    await addColumnIfMissing(queryRunner, 'users', 'digest_email', 'TINYINT(1) NOT NULL DEFAULT 0');
    await addColumnIfMissing(queryRunner, 'users', 'phone_verified', 'TINYINT(1) NOT NULL DEFAULT 0');
    await addColumnIfMissing(queryRunner, 'users', 'phone_verified_at', 'DATETIME NULL');
    await addColumnIfMissing(queryRunner, 'users', 'pending_avatar_url', 'VARCHAR(500) NULL');
    await addColumnIfMissing(queryRunner, 'users', 'avatar_status', "VARCHAR(30) NOT NULL DEFAULT 'approved'");
    await addColumnIfMissing(queryRunner, 'users', 'updated_at', 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');

    await addColumnIfMissing(queryRunner, 'posts', 'server_id', 'INT NULL');
    await addColumnIfMissing(queryRunner, 'posts', 'required_group_id', 'INT NULL');
    await addColumnIfMissing(queryRunner, 'posts', 'post_type', "VARCHAR(50) NOT NULL DEFAULT 'normal'");
    await addColumnIfMissing(queryRunner, 'posts', 'like_count', 'INT NOT NULL DEFAULT 0');
    await addColumnIfMissing(queryRunner, 'posts', 'slug', 'VARCHAR(100) NULL');
    await addColumnIfMissing(queryRunner, 'posts', 'reject_reason', 'VARCHAR(500) NULL');

    await addColumnIfMissing(queryRunner, 'replies', 'like_count', 'INT NOT NULL DEFAULT 0');

    await addColumnIfMissing(queryRunner, 'resource_versions', 'file_name', 'VARCHAR(255) NULL');
    await addColumnIfMissing(queryRunner, 'resource_versions', 'file_size', 'INT NULL');
    await addColumnIfMissing(queryRunner, 'resource_versions', 'mime_type', 'VARCHAR(100) NULL');

    await addColumnIfMissing(queryRunner, 'resources', 'use_mfl', 'TINYINT(1) NOT NULL DEFAULT 0');
    await addColumnIfMissing(queryRunner, 'resources', 'mfl_file_id', 'INT NULL');
    await addColumnIfMissing(queryRunner, 'resources', 'mfl_download_url', 'VARCHAR(500) NULL');
    await addColumnIfMissing(queryRunner, 'resources', 'slug', 'VARCHAR(100) NULL');
    await addColumnIfMissing(queryRunner, 'resources', 'rating_count', 'INT NOT NULL DEFAULT 0');
    await addColumnIfMissing(queryRunner, 'resources', 'rating_sum', 'INT NOT NULL DEFAULT 0');
    await addColumnIfMissing(queryRunner, 'resources', 'rating_average', 'DECIMAL(3,2) NOT NULL DEFAULT 0');

    // Soft-delete columns
    await addColumnIfMissing(queryRunner, 'posts', 'deleted_at', 'DATETIME NULL');
    await addColumnIfMissing(queryRunner, 'replies', 'deleted_at', 'DATETIME NULL');
    await addColumnIfMissing(queryRunner, 'resources', 'deleted_at', 'DATETIME NULL');

    // Rendered HTML content
    await addColumnIfMissing(queryRunner, 'posts', 'content_html', 'TEXT NULL');
    await addColumnIfMissing(queryRunner, 'replies', 'content_html', 'TEXT NULL');

    // Messages table patches
    await addColumnIfMissing(queryRunner, 'messages', 'content_html', 'TEXT NULL');
    await addColumnIfMissing(queryRunner, 'messages', 'group_chat_id', 'INT NULL');
    await addColumnIfMissing(queryRunner, 'messages', 'deleted_by_sender', 'TINYINT(1) NOT NULL DEFAULT 0');
    await addColumnIfMissing(queryRunner, 'messages', 'deleted_by_recipient', 'TINYINT(1) NOT NULL DEFAULT 0');
    await addColumnIfMissing(queryRunner, 'messages', 'read_at', 'DATETIME NULL');
  }
}
