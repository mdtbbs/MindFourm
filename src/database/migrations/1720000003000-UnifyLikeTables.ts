import { MigrationInterface, QueryRunner } from 'typeorm';
import { columnExists, tableExists } from './migration-utils';

/**
 * Give `post_likes` / `reply_likes` one shape everywhere: a composite primary key
 * over the pair, with no surrogate `id`.
 *
 * The entities declare composite `@PrimaryColumn`s, so a database created by
 * synchronize has `PRIMARY KEY (user_id, post_id)`. Databases built from the old
 * `schema.sql` instead have `id INT AUTO_INCREMENT PRIMARY KEY` plus
 * `UNIQUE (user_id, post_id)` — structurally different tables behind identical
 * code, which is exactly the kind of divergence that makes a bug reproduce on one
 * environment and not another. `LikesService` only ever queries by the pair, so
 * the surrogate key is unread and dropping it loses nothing.
 */
const LIKE_TABLES: Array<{ table: string; targetColumn: string }> = [
  { table: 'post_likes', targetColumn: 'post_id' },
  { table: 'reply_likes', targetColumn: 'reply_id' },
];

export class UnifyLikeTables1720000003000 implements MigrationInterface {
  name = 'UnifyLikeTables1720000003000';

  /** Each statement below is DDL, which MySQL commits implicitly. */
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const { table, targetColumn } of LIKE_TABLES) {
      await this.convert(queryRunner, table, targetColumn);
    }
  }

  public async down(): Promise<void> {
    // Deliberately not reversed: re-adding a surrogate key nothing reads would
    // only restore the divergence this migration exists to remove.
  }

  private async convert(
    queryRunner: QueryRunner,
    table: string,
    targetColumn: string,
  ): Promise<void> {
    if (!(await tableExists(queryRunner, table))) return;
    // Already in the entity shape.
    if (!(await columnExists(queryRunner, table, 'id'))) return;

    const orphanRows = await queryRunner.query(
      `SELECT COUNT(*) AS count
         FROM \`${table}\`
        WHERE \`user_id\` IS NULL OR \`${targetColumn}\` IS NULL`,
    );
    if (Number(orphanRows[0]?.count ?? 0) > 0) {
      // ADD PRIMARY KEY coerces NULLs to 0 rather than failing, which would
      // fabricate likes attributed to user 0.
      await queryRunner.query(
        `DELETE FROM \`${table}\` WHERE \`user_id\` IS NULL OR \`${targetColumn}\` IS NULL`,
      );
    }

    const duplicates = await queryRunner.query(
      `SELECT \`user_id\`
         FROM \`${table}\`
        GROUP BY \`user_id\`, \`${targetColumn}\`
       HAVING COUNT(*) > 1
        LIMIT 1`,
    );
    if (duplicates.length > 0) {
      console.warn(
        `[migration] Skipping ${table} primary key conversion: duplicate ` +
        `(user_id, ${targetColumn}) pairs exist. De-duplicate them and re-run.`,
      );
      return;
    }

    // AUTO_INCREMENT has to go first: MySQL refuses to drop the key an auto
    // column depends on.
    await queryRunner.query(`ALTER TABLE \`${table}\` MODIFY \`id\` INT NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE \`${table}\`
         MODIFY \`user_id\` INT NOT NULL,
         MODIFY \`${targetColumn}\` INT NOT NULL`,
    );
    // Swapping both keys in one statement keeps an index with `user_id` leftmost
    // available throughout, which the user_id foreign key requires.
    await queryRunner.query(
      `ALTER TABLE \`${table}\`
         DROP PRIMARY KEY,
         ADD PRIMARY KEY (\`user_id\`, \`${targetColumn}\`)`,
    );
    await queryRunner.query(`ALTER TABLE \`${table}\` DROP COLUMN \`id\``);

    // The old UNIQUE spans exactly the new primary key's columns, and its name was
    // assigned by MySQL, so it has to be looked up rather than guessed.
    const redundant = await queryRunner.query(
      `SELECT index_name
         FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name = ?
          AND non_unique = 0
          AND index_name <> 'PRIMARY'
        GROUP BY index_name
       HAVING GROUP_CONCAT(column_name ORDER BY seq_in_index) = ?`,
      [table, `user_id,${targetColumn}`],
    );
    for (const row of redundant) {
      await queryRunner.query(
        `DROP INDEX \`${row.index_name}\` ON \`${table}\``,
      );
    }
  }
}
