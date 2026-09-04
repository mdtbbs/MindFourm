import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  addForeignKeyIfMissing,
  createIndexIfMissing,
  tableExists,
} from './migration-utils';

export class CreateExternalApiTables1720000011000 implements MigrationInterface {
  name = 'CreateExternalApiTables1720000011000';
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await tableExists(queryRunner, 'external_api_keys'))) {
      await queryRunner.query(`
        CREATE TABLE \`external_api_keys\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`name\` VARCHAR(100) NOT NULL,
          \`key_prefix\` VARCHAR(32) NOT NULL,
          \`key_hash\` VARCHAR(64) NOT NULL,
          \`scopes_json\` TEXT NOT NULL,
          \`allowed_ips_json\` TEXT NULL,
          \`default_user_id\` INT NULL,
          \`rate_limit_per_minute\` INT NOT NULL DEFAULT 120,
          \`enabled\` TINYINT(1) NOT NULL DEFAULT 1,
          \`expires_at\` DATETIME NULL,
          \`last_used_at\` DATETIME NULL,
          \`created_by\` INT NULL,
          \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          UNIQUE KEY \`idx_external_api_keys_prefix\` (\`key_prefix\`),
          PRIMARY KEY (\`id\`)
        )
      `);
    }

    if (!(await tableExists(queryRunner, 'external_api_audit_logs'))) {
      await queryRunner.query(`
        CREATE TABLE \`external_api_audit_logs\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`api_key_id\` INT NULL,
          \`api_key_name\` VARCHAR(100) NULL,
          \`action\` VARCHAR(120) NOT NULL,
          \`scope\` VARCHAR(100) NULL,
          \`actor_user_id\` INT NULL,
          \`target_type\` VARCHAR(100) NULL,
          \`target_id\` INT NULL,
          \`request_id\` VARCHAR(100) NULL,
          \`ip_address\` VARCHAR(45) NULL,
          \`user_agent\` TEXT NULL,
          \`details_json\` TEXT NULL,
          \`status\` VARCHAR(20) NOT NULL DEFAULT 'success',
          \`error_message\` TEXT NULL,
          \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          PRIMARY KEY (\`id\`)
        )
      `);
    }

    await createIndexIfMissing(queryRunner, 'external_api_keys', 'idx_external_api_keys_enabled', ['enabled']);
    await createIndexIfMissing(queryRunner, 'external_api_audit_logs', 'idx_external_api_audit_key_created', ['api_key_id', 'created_at']);
    await createIndexIfMissing(queryRunner, 'external_api_audit_logs', 'idx_external_api_audit_action', ['action']);
    await createIndexIfMissing(queryRunner, 'external_api_audit_logs', 'idx_external_api_audit_status', ['status']);
    await createIndexIfMissing(queryRunner, 'external_api_audit_logs', 'idx_external_api_audit_actor', ['actor_user_id']);

    await addForeignKeyIfMissing(
      queryRunner,
      'external_api_keys',
      'fk_external_api_keys_default_user',
      'default_user_id',
      'users',
      'id',
      'SET NULL',
    );
    await addForeignKeyIfMissing(
      queryRunner,
      'external_api_keys',
      'fk_external_api_keys_creator',
      'created_by',
      'users',
      'id',
      'SET NULL',
    );
    await addForeignKeyIfMissing(
      queryRunner,
      'external_api_audit_logs',
      'fk_external_api_audit_key',
      'api_key_id',
      'external_api_keys',
      'id',
      'SET NULL',
    );
    await addForeignKeyIfMissing(
      queryRunner,
      'external_api_audit_logs',
      'fk_external_api_audit_actor',
      'actor_user_id',
      'users',
      'id',
      'SET NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `external_api_audit_logs`');
    await queryRunner.query('DROP TABLE IF EXISTS `external_api_keys`');
  }
}
