import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateResourceLikes1720000055000 implements MigrationInterface {
  name = 'CreateResourceLikes1720000055000';
  transaction = false;

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`resource_likes\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`user_id\` INT NOT NULL,
        \`resource_id\` INT NOT NULL,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`uq_resource_likes_user_resource\` (\`user_id\`, \`resource_id\`),
        INDEX \`idx_resource_likes_user\` (\`user_id\`),
        INDEX \`idx_resource_likes_resource\` (\`resource_id\`),
        CONSTRAINT \`fk_rl_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_rl_resource\` FOREIGN KEY (\`resource_id\`) REFERENCES \`resources\` (\`id\`) ON DELETE CASCADE
      )
    `);
  }

  async down(): Promise<void> {}
}
