import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGameServers1720000031000 implements MigrationInterface {
  name = 'CreateGameServers1720000031000';
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`game_servers\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`public_id\` CHAR(36) NOT NULL,
        \`name\` VARCHAR(255) NOT NULL,
        \`slug\` VARCHAR(255) NULL,
        \`description\` TEXT NULL,
        \`hostname\` VARCHAR(255) NOT NULL,
        \`port\` INT NOT NULL,
        \`protocol\` VARCHAR(50) NULL,
        \`server_type\` VARCHAR(50) NOT NULL DEFAULT 'community',
        \`status\` VARCHAR(50) NOT NULL DEFAULT 'pending',
        \`is_public\` TINYINT NOT NULL DEFAULT 1,
        \`owner_user_id\` INT NULL,
        \`discussion_thread_id\` INT NULL,
        \`metadata_json\` JSON NULL,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`uq_game_servers_public_id\` (\`public_id\`),
        INDEX \`idx_game_servers_slug\` (\`slug\`)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`game_server_snapshots\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`game_server_id\` INT NOT NULL,
        \`is_online\` TINYINT NOT NULL DEFAULT 0,
        \`player_count\` INT NULL,
        \`max_players\` INT NULL,
        \`map_name\` VARCHAR(255) NULL,
        \`game_version\` VARCHAR(100) NULL,
        \`response_time_ms\` INT NULL,
        \`captured_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`idx_server_snapshots_server\` (\`game_server_id\`),
        CONSTRAINT \`fk_gss_server\` FOREIGN KEY (\`game_server_id\`) REFERENCES \`game_servers\` (\`id\`) ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `game_server_snapshots`');
    await queryRunner.query('DROP TABLE IF EXISTS `game_servers`');
  }
}
