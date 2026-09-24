import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class GameContentDurability1720000060000 implements MigrationInterface {
  name = 'GameContentDurability1720000060000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const resources = await queryRunner.getTable('resources');
    if (resources && !resources.findColumnByName('is_featured')) {
      await queryRunner.addColumn('resources', new TableColumn({
        name: 'is_featured', type: 'tinyint', unsigned: true, isNullable: false, default: 0,
      }));
    }
    if (resources && !resources.findColumnByName('view_count')) {
      await queryRunner.addColumn('resources', new TableColumn({
        name: 'view_count', type: 'bigint', unsigned: true, isNullable: false, default: 0,
      }));
    }

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS download_events (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        event_type VARCHAR(16) NOT NULL,
        resource_id INT UNSIGNED NOT NULL,
        version_id INT UNSIGNED NULL,
        file_id INT UNSIGNED NULL,
        user_id INT UNSIGNED NULL,
        client_type VARCHAR(40) NULL,
        client_version VARCHAR(80) NULL,
        platform VARCHAR(40) NULL,
        backend VARCHAR(32) NULL,
        dedup_key CHAR(64) NULL,
        dedup_bucket BIGINT UNSIGNED NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_download_events_dedup_bucket (dedup_key, dedup_bucket),
        KEY idx_download_events_resource_created (resource_id, created_at),
        KEY idx_download_events_file_created (file_id, created_at),
        KEY idx_download_events_user_created (user_id, created_at),
        KEY idx_download_events_type_created (event_type, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS download_grant_dedup (
        dedup_key CHAR(64) NOT NULL,
        last_granted_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (dedup_key),
        KEY idx_download_grant_dedup_expiry (last_granted_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS game_content_upload_sessions (
        id CHAR(36) NOT NULL,
        user_id INT NOT NULL,
        resource_kind VARCHAR(16) NOT NULL DEFAULT 'map',
        filename VARCHAR(255) NOT NULL,
        mime_type VARCHAR(100) NULL,
        actual_size BIGINT UNSIGNED NOT NULL,
        expected_sha256 CHAR(64) NOT NULL,
        actual_sha256 CHAR(64) NOT NULL,
        storage_key VARCHAR(500) NOT NULL,
        preview_key VARCHAR(500) NULL,
        parser_version VARCHAR(100) NULL,
        renderer_metadata JSON NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'uploaded',
        resource_id INT NULL,
        expires_at DATETIME NOT NULL,
        completed_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_game_content_upload_owner_status (user_id, status, created_at),
        KEY idx_game_content_upload_expiry (status, expires_at),
        KEY idx_game_content_upload_hash (actual_sha256),
        CONSTRAINT fk_game_content_upload_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    const refreshedResources = await queryRunner.getTable('resources');
    if (refreshedResources && !refreshedResources.findColumnByName('game_content_upload_session_id')) {
      await queryRunner.addColumn('resources', new TableColumn({
        name: 'game_content_upload_session_id', type: 'char', length: '36', isNullable: true,
      }));
    }
    const resourcesWithSessionColumn = await queryRunner.getTable('resources');
    if (resourcesWithSessionColumn?.findColumnByName('game_content_upload_session_id')
      && !resourcesWithSessionColumn.indices.some((index) => index.name === 'uq_resources_game_content_upload_session')) {
      await queryRunner.createIndex('resources', new TableIndex({
        name: 'uq_resources_game_content_upload_session', columnNames: ['game_content_upload_session_id'], isUnique: true,
      }));
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS game_content_upload_sessions');
    await queryRunner.query('DROP TABLE IF EXISTS download_grant_dedup');
    // download_events is owned by the earlier media/download migration. This
    // migration only upgrades its schema and must not remove its historical rows.
    const resources = await queryRunner.getTable('resources');
    if (resources?.findColumnByName('game_content_upload_session_id')) {
      const index = resources.indices.find((item) => item.name === 'uq_resources_game_content_upload_session');
      if (index) await queryRunner.dropIndex('resources', index);
      await queryRunner.dropColumn('resources', 'game_content_upload_session_id');
    }
    if (resources?.findColumnByName('view_count')) await queryRunner.dropColumn('resources', 'view_count');
    if (resources?.findColumnByName('is_featured')) await queryRunner.dropColumn('resources', 'is_featured');
  }
}
