import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  tableExists,
  columnExists,
  addColumnIfMissing,
  createIndexIfMissing,
} from './migration-utils';

export class ExpandResourceAggregate1720000026000 implements MigrationInterface {
  name = 'ExpandResourceAggregate1720000026000';
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- New tables (idempotent CREATE TABLE IF NOT EXISTS) ---

    // 1. resource_attributions
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`resource_attributions\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`resource_id\` INT NOT NULL,
        \`role\` VARCHAR(50) NOT NULL,
        \`subject_type\` VARCHAR(50) NOT NULL,
        \`user_id\` INT NULL,
        \`display_name\` VARCHAR(255) NULL,
        \`profile_url\` VARCHAR(500) NULL,
        \`source_url\` VARCHAR(500) NULL,
        \`sort_order\` INT NOT NULL DEFAULT 0,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`idx_resource_attributions_resource\` (\`resource_id\`),
        CONSTRAINT \`fk_resource_attributions_resource\` FOREIGN KEY (\`resource_id\`) REFERENCES \`resources\` (\`id\`) ON DELETE CASCADE
      )
    `);

    // 2. resource_files
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`resource_files\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`public_id\` CHAR(36) NOT NULL,
        \`resource_version_id\` INT NOT NULL,
        \`role\` VARCHAR(50) NOT NULL,
        \`delivery_mode\` VARCHAR(50) NOT NULL,
        \`platform_key\` VARCHAR(50) NULL,
        \`architecture_key\` VARCHAR(50) NULL,
        \`package_type\` VARCHAR(50) NULL,
        \`display_name\` VARCHAR(255) NULL,
        \`original_filename\` VARCHAR(500) NULL,
        \`mime_type\` VARCHAR(100) NULL,
        \`size_bytes\` INT NULL,
        \`hash_algorithm\` VARCHAR(20) NULL,
        \`content_hash\` VARCHAR(128) NULL,
        \`integrity_status\` VARCHAR(50) NOT NULL DEFAULT 'unverified_legacy',
        \`storage_backend\` VARCHAR(50) NULL,
        \`storage_key\` VARCHAR(500) NULL,
        \`provider_file_id\` INT NULL,
        \`external_url\` VARCHAR(500) NULL,
        \`availability_status\` VARCHAR(50) NOT NULL DEFAULT 'available',
        \`sort_order\` INT NOT NULL DEFAULT 0,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`uq_resource_files_public_id\` (\`public_id\`),
        INDEX \`idx_resource_files_version\` (\`resource_version_id\`),
        CONSTRAINT \`fk_resource_files_version\` FOREIGN KEY (\`resource_version_id\`) REFERENCES \`resource_versions\` (\`id\`) ON DELETE CASCADE
      )
    `);

    // 3. resource_version_dependencies
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`resource_version_dependencies\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`resource_version_id\` INT NOT NULL,
        \`dependency_type\` VARCHAR(50) NOT NULL,
        \`target_resource_id\` INT NULL,
        \`external_identifier\` VARCHAR(255) NULL,
        \`version_constraint\` VARCHAR(255) NULL,
        \`notes\` TEXT NULL,
        \`sort_order\` INT NOT NULL DEFAULT 0,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`idx_rv_dependencies_version\` (\`resource_version_id\`),
        CONSTRAINT \`fk_rv_dependencies_version\` FOREIGN KEY (\`resource_version_id\`) REFERENCES \`resource_versions\` (\`id\`) ON DELETE CASCADE
      )
    `);

    // 4. resource_version_compatibilities
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`resource_version_compatibilities\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`resource_version_id\` INT NOT NULL,
        \`runtime\` VARCHAR(50) NOT NULL,
        \`game_series\` VARCHAR(50) NULL,
        \`min_version_value\` VARCHAR(50) NULL,
        \`max_version_value\` VARCHAR(50) NULL,
        \`channel\` VARCHAR(50) NULL,
        \`platform_key\` VARCHAR(50) NULL,
        \`notes\` TEXT NULL,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`idx_rv_compatibilities_version\` (\`resource_version_id\`),
        CONSTRAINT \`fk_rv_compatibilities_version\` FOREIGN KEY (\`resource_version_id\`) REFERENCES \`resource_versions\` (\`id\`) ON DELETE CASCADE
      )
    `);

    // --- Extend resources table (additive columns only) ---
    if (await tableExists(queryRunner, 'resources')) {
      await addColumnIfMissing(queryRunner, 'resources', 'public_id', 'CHAR(36) NULL');
      await addColumnIfMissing(queryRunner, 'resources', 'summary', 'TEXT NULL');
      await addColumnIfMissing(queryRunner, 'resources', 'resource_kind', 'VARCHAR(50) NULL');
      await addColumnIfMissing(queryRunner, 'resources', 'visibility', 'VARCHAR(50) NULL');
      await addColumnIfMissing(queryRunner, 'resources', 'homepage_url', 'VARCHAR(500) NULL');
      await addColumnIfMissing(queryRunner, 'resources', 'source_url', 'VARCHAR(500) NULL');
      await addColumnIfMissing(queryRunner, 'resources', 'license', 'VARCHAR(100) NULL');
      await addColumnIfMissing(queryRunner, 'resources', 'latest_published_version_id', 'INT NULL');
      await addColumnIfMissing(queryRunner, 'resources', 'discussion_thread_id', 'INT NULL');
      await addColumnIfMissing(queryRunner, 'resources', 'metadata_json', 'JSON NULL');

      // Add unique index on public_id if column was added
      if (await columnExists(queryRunner, 'resources', 'public_id')) {
        await createIndexIfMissing(queryRunner, 'resources', 'uq_resources_public_id', ['public_id']);
      }
    }

    // --- Extend resource_versions table (additive columns only) ---
    if (await tableExists(queryRunner, 'resource_versions')) {
      await addColumnIfMissing(queryRunner, 'resource_versions', 'public_id', 'CHAR(36) NULL');
      await addColumnIfMissing(queryRunner, 'resource_versions', 'release_channel', 'VARCHAR(50) NULL');
      await addColumnIfMissing(queryRunner, 'resource_versions', 'status', 'VARCHAR(50) NULL');
      await addColumnIfMissing(queryRunner, 'resource_versions', 'release_notes_markdown', 'TEXT NULL');
      await addColumnIfMissing(queryRunner, 'resource_versions', 'release_notes_html', 'TEXT NULL');
      await addColumnIfMissing(queryRunner, 'resource_versions', 'published_at', 'DATETIME NULL');
      await addColumnIfMissing(queryRunner, 'resource_versions', 'created_by_user_id', 'INT NULL');
      await addColumnIfMissing(queryRunner, 'resource_versions', 'reviewed_by_user_id', 'INT NULL');
      await addColumnIfMissing(queryRunner, 'resource_versions', 'reviewed_at', 'DATETIME NULL');
      await addColumnIfMissing(queryRunner, 'resource_versions', 'reject_reason', 'VARCHAR(500) NULL');
      await addColumnIfMissing(queryRunner, 'resource_versions', 'is_legacy_root_release', 'TINYINT NOT NULL DEFAULT 0');

      if (await columnExists(queryRunner, 'resource_versions', 'public_id')) {
        await createIndexIfMissing(queryRunner, 'resource_versions', 'uq_resource_versions_public_id', ['public_id']);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop new tables in reverse order
    await queryRunner.query('DROP TABLE IF EXISTS `resource_version_compatibilities`');
    await queryRunner.query('DROP TABLE IF EXISTS `resource_version_dependencies`');
    await queryRunner.query('DROP TABLE IF EXISTS `resource_files`');
    await queryRunner.query('DROP TABLE IF EXISTS `resource_attributions`');

    // Note: We do NOT drop the added columns from resources/resource_versions in down.
    // TypeORM migrations do not support column-level rollback reliably; a full
    // schema backup/restore is the correct rollback path for production.
  }
}
