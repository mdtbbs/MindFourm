import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateKnowledge1720000032000 implements MigrationInterface {
  name = 'CreateKnowledge1720000032000';
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`knowledge_articles\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`public_id\` CHAR(36) NOT NULL,
        \`title\` VARCHAR(255) NOT NULL,
        \`slug\` VARCHAR(255) NULL,
        \`summary\` TEXT NULL,
        \`content_markdown\` TEXT NULL,
        \`content_html\` TEXT NULL,
        \`status\` VARCHAR(50) NOT NULL DEFAULT 'draft',
        \`category\` VARCHAR(100) NULL,
        \`sort_order\` INT NOT NULL DEFAULT 0,
        \`is_public\` TINYINT NOT NULL DEFAULT 1,
        \`author_user_id\` INT NULL,
        \`related_resource_id\` INT NULL,
        \`related_thread_id\` INT NULL,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`uq_knowledge_articles_public_id\` (\`public_id\`),
        INDEX \`idx_knowledge_articles_slug\` (\`slug\`)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`knowledge_revisions\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`article_id\` INT NOT NULL,
        \`content_markdown\` TEXT NULL,
        \`change_summary\` VARCHAR(255) NULL,
        \`revised_by_user_id\` INT NULL,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`idx_knowledge_revisions_article\` (\`article_id\`),
        CONSTRAINT \`fk_kr_article\` FOREIGN KEY (\`article_id\`) REFERENCES \`knowledge_articles\` (\`id\`) ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `knowledge_revisions`');
    await queryRunner.query('DROP TABLE IF EXISTS `knowledge_articles`');
  }
}
