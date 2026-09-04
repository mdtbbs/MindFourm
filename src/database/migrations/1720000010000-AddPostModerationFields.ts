import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  addColumnIfMissing,
  addForeignKeyIfMissing,
  columnExists,
  createIndexIfMissing,
  tableExists,
} from './migration-utils';

/**
 * Thread locking, accepted answers, and post edit history.
 *
 * Adds `posts.is_locked` / `posts.best_reply_id` / `posts.edited_at` and the
 * `post_revisions` table.
 *
 * Every step probes information_schema first. On an empty database the baseline
 * materialises the whole schema from entity metadata, so all of these objects
 * already exist by the time this runs; on a long-lived database none of them do.
 * MySQL 8 has neither `ADD COLUMN IF NOT EXISTS` nor `CREATE INDEX IF NOT EXISTS`,
 * and a duplicate is a hard error during `DataSource.initialize()` — which takes the
 * process down at boot rather than failing a single request.
 *
 * Column definitions mirror what TypeORM emits for the entities (`tinyint` for
 * `is_locked`, `datetime(6)` for `@CreateDateColumn`) so the two schema sources
 * converge instead of drifting apart by type.
 */
export class AddPostModerationFields1720000010000 implements MigrationInterface {
  name = 'AddPostModerationFields1720000010000';

  /** MySQL commits DDL implicitly, so a wrapping transaction buys nothing. */
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Without `posts` there is nothing to alter and nothing for the revision rows to
    // reference: the baseline has not run yet.
    if (!(await tableExists(queryRunner, 'posts'))) return;

    await addColumnIfMissing(queryRunner, 'posts', 'is_locked', 'TINYINT NOT NULL DEFAULT 0');
    await addColumnIfMissing(queryRunner, 'posts', 'best_reply_id', 'INT NULL');
    await addColumnIfMissing(queryRunner, 'posts', 'edited_at', 'DATETIME NULL');

    // SET NULL, so deleting the accepted reply just unmarks the post.
    await addForeignKeyIfMissing(
      queryRunner, 'posts', 'fk_posts_best_reply', 'best_reply_id', 'replies', 'id', 'SET NULL',
    );

    if (!(await tableExists(queryRunner, 'post_revisions'))) {
      await queryRunner.query(`
        CREATE TABLE \`post_revisions\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`post_id\` INT NOT NULL,
          \`editor_id\` INT NULL,
          \`title\` VARCHAR(255) NOT NULL,
          \`content\` TEXT NOT NULL,
          \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          PRIMARY KEY (\`id\`)
        )
      `);
    }

    // Name matches the `@Index` decorator so both schema sources produce one index
    // object rather than one database carrying both spellings.
    await createIndexIfMissing(queryRunner, 'post_revisions', 'idx_post_revisions_post_created', [
      'post_id',
      'created_at',
    ]);

    await addForeignKeyIfMissing(
      queryRunner, 'post_revisions', 'fk_post_revisions_post', 'post_id', 'posts', 'id', 'CASCADE',
    );
    await addForeignKeyIfMissing(
      queryRunner, 'post_revisions', 'fk_post_revisions_editor', 'editor_id', 'users', 'id', 'SET NULL',
    );
  }

  /**
   * Drops the edit history and the three columns.
   *
   * The foreign key on `best_reply_id` has to go first — MySQL refuses to drop a
   * column a constraint still covers — and it is looked up by column rather than by
   * name, because on a database built by the baseline's `synchronize()` the
   * constraint carries TypeORM's generated name instead of ours.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `post_revisions`');

    if (!(await tableExists(queryRunner, 'posts'))) return;

    if (await columnExists(queryRunner, 'posts', 'best_reply_id')) {
      const constraints: Array<{ constraint_name: string }> = await queryRunner.query(
        `SELECT constraint_name
           FROM information_schema.key_column_usage
          WHERE table_schema = DATABASE()
            AND table_name = 'posts'
            AND column_name = 'best_reply_id'
            AND referenced_table_name IS NOT NULL`,
      );
      for (const { constraint_name: name } of constraints) {
        await queryRunner.query(`ALTER TABLE \`posts\` DROP FOREIGN KEY \`${name}\``);
      }
      await queryRunner.query('ALTER TABLE `posts` DROP COLUMN `best_reply_id`');
    }

    for (const column of ['is_locked', 'edited_at']) {
      if (await columnExists(queryRunner, 'posts', column)) {
        await queryRunner.query(`ALTER TABLE \`posts\` DROP COLUMN \`${column}\``);
      }
    }
  }
}
