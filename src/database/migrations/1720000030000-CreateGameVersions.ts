import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGameVersions1720000030000 implements MigrationInterface {
  name = 'CreateGameVersions1720000030000';
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`game_versions\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`public_id\` CHAR(36) NOT NULL,
        \`version_value\` VARCHAR(50) NOT NULL,
        \`game_series\` VARCHAR(50) NOT NULL,
        \`release_channel\` VARCHAR(50) NOT NULL,
        \`display_name\` VARCHAR(255) NULL,
        \`changelog\` TEXT NULL,
        \`released_at\` DATETIME NULL,
        \`is_official\` TINYINT NOT NULL DEFAULT 0,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`uq_game_versions_public_id\` (\`public_id\`),
        INDEX \`idx_game_versions_series\` (\`game_series\`)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`game_version_builds\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`game_version_id\` INT NOT NULL,
        \`platform_key\` VARCHAR(50) NULL,
        \`download_url\` VARCHAR(500) NULL,
        \`size_bytes\` INT NULL,
        \`hash_algorithm\` VARCHAR(20) NULL,
        \`content_hash\` VARCHAR(128) NULL,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`idx_game_version_builds_version\` (\`game_version_id\`),
        CONSTRAINT \`fk_gvb_version\` FOREIGN KEY (\`game_version_id\`) REFERENCES \`game_versions\` (\`id\`) ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `game_version_builds`');
    await queryRunner.query('DROP TABLE IF EXISTS `game_versions`');
  }
}
