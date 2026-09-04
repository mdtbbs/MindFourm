import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOutboxEvents1720000028000 implements MigrationInterface {
  name = 'CreateOutboxEvents1720000028000';
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`outbox_events\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`event_key\` VARCHAR(100) NOT NULL,
        \`aggregate_type\` VARCHAR(50) NOT NULL,
        \`aggregate_id\` INT NOT NULL,
        \`payload_json\` JSON NOT NULL,
        \`status\` VARCHAR(50) NOT NULL DEFAULT 'pending',
        \`retry_count\` INT NOT NULL DEFAULT 0,
        \`last_error\` TEXT NULL,
        \`processed_at\` DATETIME NULL,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`idx_outbox_events_status\` (\`status\`),
        INDEX \`idx_outbox_events_key\` (\`event_key\`),
        INDEX \`idx_outbox_events_aggregate\` (\`aggregate_type\`, \`aggregate_id\`)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `outbox_events`');
  }
}
