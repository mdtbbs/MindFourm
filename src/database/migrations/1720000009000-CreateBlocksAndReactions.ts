import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  addForeignKeyIfMissing,
  addUniqueIfMissing,
  createIndexIfMissing,
  tableExists,
} from './migration-utils';

/**
 * Tables for user blocks and emoji reactions.
 *
 * Both tables already exist on a database built from the baseline's
 * `synchronize()`, so every step probes information_schema first: MySQL 8 has no
 * `CREATE INDEX IF NOT EXISTS`, and a duplicate index is a hard error during
 * `DataSource.initialize()` — which takes the process down on boot rather than
 * failing one request.
 *
 * The column definitions mirror what TypeORM emits for the entity metadata
 * (`datetime(6)` for `@CreateDateColumn`, `utf8mb4_bin` for `emoji`) so the
 * synchronize path and this path converge on one schema. `emoji` in particular must
 * not fall back to the schema default collation: `utf8mb4_general_ci` gives all
 * supplementary-plane characters the same weight, which would make the unique
 * constraint reject a second distinct emoji from the same user.
 */
export class CreateBlocksAndReactions1720000009000 implements MigrationInterface {
  name = 'CreateBlocksAndReactions1720000009000';

  /** MySQL commits DDL implicitly, so a wrapping transaction buys nothing. */
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await tableExists(queryRunner, 'user_blocks'))) {
      await queryRunner.query(`
        CREATE TABLE \`user_blocks\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`blocker_id\` INT NOT NULL,
          \`blocked_id\` INT NOT NULL,
          \`reason\` VARCHAR(200) NULL,
          \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          PRIMARY KEY (\`id\`)
        )
      `);
    }

    if (!(await tableExists(queryRunner, 'reactions'))) {
      await queryRunner.query(`
        CREATE TABLE \`reactions\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`user_id\` INT NOT NULL,
          \`target_type\` VARCHAR(20) NOT NULL,
          \`target_id\` INT NOT NULL,
          \`emoji\` VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
          \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          PRIMARY KEY (\`id\`)
        )
      `);
    }

    await addUniqueIfMissing(queryRunner, 'user_blocks', 'uq_user_blocks_blocker_blocked', [
      'blocker_id',
      'blocked_id',
    ]);
    await addUniqueIfMissing(queryRunner, 'reactions', 'uq_reactions_user_target_emoji', [
      'user_id',
      'target_type',
      'target_id',
      'emoji',
    ]);

    // Names match the `@Index` decorators so the two schema sources produce the same
    // index objects instead of one database carrying both spellings.
    await createIndexIfMissing(queryRunner, 'user_blocks', 'idx_user_blocks_blocker', ['blocker_id']);
    await createIndexIfMissing(queryRunner, 'user_blocks', 'idx_user_blocks_blocked', ['blocked_id']);
    await createIndexIfMissing(queryRunner, 'reactions', 'idx_reactions_target', [
      'target_type',
      'target_id',
    ]);

    await addForeignKeyIfMissing(
      queryRunner, 'user_blocks', 'fk_user_blocks_blocker', 'blocker_id', 'users', 'id', 'CASCADE',
    );
    await addForeignKeyIfMissing(
      queryRunner, 'user_blocks', 'fk_user_blocks_blocked', 'blocked_id', 'users', 'id', 'CASCADE',
    );
    // `reactions.target_id` intentionally has none: the column is polymorphic over
    // posts and replies, so the service checks the target instead.
    await addForeignKeyIfMissing(
      queryRunner, 'reactions', 'fk_reactions_user', 'user_id', 'users', 'id', 'CASCADE',
    );
  }

  /**
   * Drops both tables, and with them every block and reaction.
   *
   * On a database created by the baseline's `synchronize()` these tables predate
   * this migration, so reverting leaves that database missing them until it is
   * re-applied.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `reactions`');
    await queryRunner.query('DROP TABLE IF EXISTS `user_blocks`');
  }
}
