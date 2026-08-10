import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateResourceInteractions1720000029000 implements MigrationInterface {
  name = 'CreateResourceInteractions1720000029000';
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`resource_favorites\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`user_id\` INT NOT NULL,
        \`resource_id\` INT NOT NULL,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`uq_resource_favorites_user_resource\` (\`user_id\`, \`resource_id\`),
        INDEX \`idx_resource_favorites_user\` (\`user_id\`),
        INDEX \`idx_resource_favorites_resource\` (\`resource_id\`),
        CONSTRAINT \`fk_rf_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_rf_resource\` FOREIGN KEY (\`resource_id\`) REFERENCES \`resources\` (\`id\`) ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`resource_subscriptions\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`user_id\` INT NOT NULL,
        \`resource_id\` INT NOT NULL,
        \`notification_level\` VARCHAR(50) NOT NULL DEFAULT 'all',
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`uq_resource_subscriptions_user_resource\` (\`user_id\`, \`resource_id\`),
        INDEX \`idx_resource_subscriptions_user\` (\`user_id\`),
        CONSTRAINT \`fk_rs_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_rs_resource\` FOREIGN KEY (\`resource_id\`) REFERENCES \`resources\` (\`id\`) ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `resource_subscriptions`');
    await queryRunner.query('DROP TABLE IF EXISTS `resource_favorites`');
  }
}
