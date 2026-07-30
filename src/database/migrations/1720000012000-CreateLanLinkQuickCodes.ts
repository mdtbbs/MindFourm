import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  addForeignKeyIfMissing,
  addUniqueIfMissing,
  createIndexIfMissing,
  tableExists,
} from './migration-utils';

export class CreateLanLinkQuickCodes1720000012000 implements MigrationInterface {
  name = 'CreateLanLinkQuickCodes1720000012000';
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await tableExists(queryRunner, 'lanlink_quick_codes'))) {
      await queryRunner.query(`
        CREATE TABLE \`lanlink_quick_codes\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`user_id\` INT NOT NULL,
          \`code_prefix\` VARCHAR(24) NOT NULL,
          \`code_hash\` VARCHAR(64) NOT NULL,
          \`enabled\` TINYINT(1) NOT NULL DEFAULT 1,
          \`token_version\` INT NOT NULL DEFAULT 1,
          \`rotated_at\` DATETIME NULL,
          \`last_used_at\` DATETIME NULL,
          \`use_count\` INT NOT NULL DEFAULT 0,
          \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          UNIQUE KEY \`idx_lanlink_quick_codes_user\` (\`user_id\`),
          UNIQUE KEY \`idx_lanlink_quick_codes_hash\` (\`code_hash\`),
          PRIMARY KEY (\`id\`)
        )
      `);
    }

    await addUniqueIfMissing(queryRunner, 'lanlink_quick_codes', 'idx_lanlink_quick_codes_hash', ['code_hash']);
    await createIndexIfMissing(queryRunner, 'lanlink_quick_codes', 'idx_lanlink_quick_codes_prefix', ['code_prefix']);
    await createIndexIfMissing(queryRunner, 'lanlink_quick_codes', 'idx_lanlink_quick_codes_enabled', ['enabled']);

    await addForeignKeyIfMissing(
      queryRunner,
      'lanlink_quick_codes',
      'fk_lanlink_quick_codes_user',
      'user_id',
      'users',
      'id',
      'CASCADE',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `lanlink_quick_codes`');
  }
}
