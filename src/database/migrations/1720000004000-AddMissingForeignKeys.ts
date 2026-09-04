import { MigrationInterface, QueryRunner } from 'typeorm';
import { addForeignKeyIfMissing, addUniqueIfMissing } from './migration-utils';

/**
 * Add the referential integrity the entities never declared.
 *
 * Several columns held a foreign id with no `@ManyToOne`, so TypeORM emitted
 * neither a constraint nor an index for them: `attachments.reply_id`/`user_id`,
 * `resource_versions.resource_id`, `email_logs.user_id`, `session_audit.user_id`.
 * The `ON DELETE` rules are the ones the (never-applied) original DDL specified.
 *
 * The unique constraints below were likewise DDL-only: without them, a retried
 * request could bookmark a post twice or grant the same badge twice, and the
 * "already bookmarked" checks in application code are read-then-write races.
 */
export class AddMissingForeignKeys1720000004000 implements MigrationInterface {
  name = 'AddMissingForeignKeys1720000004000';

  /** Constraint DDL is implicitly committed by MySQL. */
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await addUniqueIfMissing(queryRunner, 'bookmarks', 'uq_bookmarks_user_post', [
      'user_id',
      'post_id',
    ]);
    await addUniqueIfMissing(queryRunner, 'resource_versions', 'uq_resource_versions_resource_version', [
      'resource_id',
      'version',
    ]);
    await addUniqueIfMissing(queryRunner, 'user_badges', 'uq_user_badges_user_badge', [
      'user_id',
      'badge_id',
    ]);

    await addForeignKeyIfMissing(
      queryRunner, 'attachments', 'fk_attachments_reply', 'reply_id', 'replies', 'id', 'CASCADE',
    );
    await addForeignKeyIfMissing(
      queryRunner, 'attachments', 'fk_attachments_user', 'user_id', 'users', 'id', 'CASCADE',
    );
    await addForeignKeyIfMissing(
      queryRunner, 'resource_versions', 'fk_resource_versions_resource', 'resource_id', 'resources', 'id', 'CASCADE',
    );
    await addForeignKeyIfMissing(
      queryRunner, 'email_logs', 'fk_email_logs_user', 'user_id', 'users', 'id', 'SET NULL',
    );
    await addForeignKeyIfMissing(
      queryRunner, 'session_audit', 'fk_session_audit_user', 'user_id', 'users', 'id', 'SET NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const constraints: Array<{ table: string; name: string; kind: 'FOREIGN KEY' | 'INDEX' }> = [
      { table: 'session_audit', name: 'fk_session_audit_user', kind: 'FOREIGN KEY' },
      { table: 'email_logs', name: 'fk_email_logs_user', kind: 'FOREIGN KEY' },
      { table: 'resource_versions', name: 'fk_resource_versions_resource', kind: 'FOREIGN KEY' },
      { table: 'attachments', name: 'fk_attachments_user', kind: 'FOREIGN KEY' },
      { table: 'attachments', name: 'fk_attachments_reply', kind: 'FOREIGN KEY' },
      { table: 'user_badges', name: 'uq_user_badges_user_badge', kind: 'INDEX' },
      { table: 'resource_versions', name: 'uq_resource_versions_resource_version', kind: 'INDEX' },
      { table: 'bookmarks', name: 'uq_bookmarks_user_post', kind: 'INDEX' },
    ];

    for (const { table, name, kind } of constraints) {
      const clause = kind === 'FOREIGN KEY' ? `DROP FOREIGN KEY \`${name}\`` : `DROP INDEX \`${name}\``;
      try {
        await queryRunner.query(`ALTER TABLE \`${table}\` ${clause}`);
      } catch {
        // The constraint may have been skipped on the way up (duplicate or orphan
        // rows), so a missing one is not an error here.
      }
    }
  }
}
