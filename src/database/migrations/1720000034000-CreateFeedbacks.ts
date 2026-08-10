import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFeedbacks1720000034000 implements MigrationInterface {
  name = 'CreateFeedbacks1720000034000';
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`feedbacks\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`type\` VARCHAR(50) NOT NULL,
        \`title\` VARCHAR(255) NOT NULL,
        \`description\` TEXT NOT NULL,
        \`contact_email\` VARCHAR(255) NULL,
        \`user_id\` INT NULL,
        \`status\` VARCHAR(50) NOT NULL DEFAULT 'pending',
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`idx_feedbacks_status\` (\`status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `feedbacks`');
  }
}
