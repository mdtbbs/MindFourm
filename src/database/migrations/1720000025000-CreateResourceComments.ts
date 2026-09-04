import { MigrationInterface, QueryRunner } from 'typeorm';
import { tableExists } from './migration-utils';

export class CreateResourceComments1720000025000 implements MigrationInterface {
  name = 'CreateResourceComments1720000025000';
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await tableExists(queryRunner, 'resources'))) return;

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`resource_comments\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`resource_id\` INT NOT NULL,
        \`user_id\` INT NOT NULL,
        \`parent_id\` INT NULL,
        \`content\` TEXT NOT NULL,
        \`content_html\` TEXT NULL,
        \`status\` VARCHAR(20) NOT NULL DEFAULT 'visible',
        \`edited_at\` DATETIME NULL,
        \`upvote_count\` INT NOT NULL DEFAULT 0,
        \`downvote_count\` INT NOT NULL DEFAULT 0,
        \`report_count\` INT NOT NULL DEFAULT 0,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`idx_resource_comments_resource\` (\`resource_id\`),
        INDEX \`idx_resource_comments_user\` (\`user_id\`),
        INDEX \`idx_resource_comments_parent\` (\`parent_id\`),
        CONSTRAINT \`fk_resource_comments_resource\` FOREIGN KEY (\`resource_id\`) REFERENCES \`resources\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_resource_comments_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_resource_comments_parent\` FOREIGN KEY (\`parent_id\`) REFERENCES \`resource_comments\` (\`id\`) ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `resource_comments`');
  }
}
