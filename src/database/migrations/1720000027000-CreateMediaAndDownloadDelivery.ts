import { MigrationInterface, QueryRunner } from 'typeorm';
import { tableExists } from './migration-utils';

export class CreateMediaAndDownloadDelivery1720000027000 implements MigrationInterface {
  name = 'CreateMediaAndDownloadDelivery1720000027000';
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    // media_assets
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`media_assets\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`public_id\` CHAR(36) NOT NULL,
        \`media_type\` VARCHAR(50) NOT NULL,
        \`storage_backend\` VARCHAR(50) NULL,
        \`storage_key\` VARCHAR(500) NULL,
        \`url\` VARCHAR(500) NULL,
        \`original_filename\` VARCHAR(255) NULL,
        \`mime_type\` VARCHAR(100) NULL,
        \`size_bytes\` INT NULL,
        \`width\` INT NULL,
        \`height\` INT NULL,
        \`hash_algorithm\` VARCHAR(20) NULL,
        \`content_hash\` VARCHAR(128) NULL,
        \`status\` VARCHAR(50) NOT NULL DEFAULT 'active',
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`uq_media_assets_public_id\` (\`public_id\`),
        INDEX \`idx_media_assets_type\` (\`media_type\`)
      )
    `);

    // resource_media_links
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`resource_media_links\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`resource_id\` INT NOT NULL,
        \`media_asset_id\` INT NOT NULL,
        \`role\` VARCHAR(50) NOT NULL,
        \`sort_order\` INT NOT NULL DEFAULT 0,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`idx_resource_media_links_resource\` (\`resource_id\`),
        CONSTRAINT \`fk_rml_resource\` FOREIGN KEY (\`resource_id\`) REFERENCES \`resources\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_rml_media_asset\` FOREIGN KEY (\`media_asset_id\`) REFERENCES \`media_assets\` (\`id\`) ON DELETE CASCADE
      )
    `);

    // download_events (placeholder for future persistence)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`download_events\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`event_type\` VARCHAR(50) NOT NULL,
        \`resource_id\` INT NOT NULL,
        \`version_id\` INT NOT NULL,
        \`file_id\` INT NOT NULL,
        \`user_id\` INT NULL,
        \`client_type\` VARCHAR(50) NULL,
        \`platform\` VARCHAR(50) NULL,
        \`backend\` VARCHAR(50) NULL,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`idx_download_events_file\` (\`file_id\`),
        INDEX \`idx_download_events_resource\` (\`resource_id\`),
        INDEX \`idx_download_events_type\` (\`event_type\`)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `download_events`');
    await queryRunner.query('DROP TABLE IF EXISTS `resource_media_links`');
    await queryRunner.query('DROP TABLE IF EXISTS `media_assets`');
  }
}
