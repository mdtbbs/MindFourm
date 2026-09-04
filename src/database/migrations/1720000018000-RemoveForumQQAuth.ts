import { MigrationInterface, QueryRunner } from 'typeorm';
import { columnExists, dropIndexIfPresent, tableExists } from './migration-utils';

/**
 * Removes the forum-owned QQ OAuth integration.
 *
 * QQ login and registration belong to the external Auth service. This migration
 * permanently removes forum-side QQ bindings and the QQ-only login tables.
 */
export class RemoveForumQQAuth1720000018000 implements MigrationInterface {
  name = 'RemoveForumQQAuth1720000018000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const index of ['idx_qq_openid', 'idx_qq_unionid']) {
      await dropIndexIfPresent(queryRunner, 'users', index);
    }

    for (const column of ['qq_openid', 'qq_unionid', 'qq_nickname', 'qq_avatar']) {
      if (await columnExists(queryRunner, 'users', column)) {
        await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`${column}\``);
      }
    }

    for (const table of ['login_log', 'user_devices']) {
      if (await tableExists(queryRunner, table)) {
        await queryRunner.query(`DROP TABLE \`${table}\``);
      }
    }
  }

  public async down(): Promise<void> {
    // QQ binding data is intentionally not recoverable after this migration.
  }
}
