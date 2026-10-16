import { MigrationInterface, QueryRunner } from 'typeorm';
import { addColumnIfMissing, createIndexIfMissing, tableExists } from './migration-utils';

const TABLE = 'multiplayer_sessions';

/**
 * Splits Session discovery from Session join eligibility.
 *
 * Before this migration `visibility` did double duty: `private` and `friends`
 * silently denied joins, and `unlisted` was both "hidden from lists" and "joinable
 * with a room code". `join_policy = request` was the only way to express
 * "eligible users still need owner approval".
 *
 * The new model is two orthogonal single-select fields — `visibility` (who can
 * discover) and `join_policy` (who may join) — plus `require_approval` for the old
 * `request` semantics.
 *
 * Legacy rows are remapped by *effective eligibility*, not by enum name, because
 * the old `visibility` values really did gate joins:
 *
 * | legacy visibility + join_policy | effective joiners          | new pair |
 * | --- | --- | --- |
 * | private  + open/friends/invite_only | invited / approved only | private  + invite_only |
 * | private  + request              | approved request only     | private  + public, require_approval |
 * | friends  + open/friends         | owner's friends           | friends  + friends |
 * | friends  + invite_only          | invited / approved only   | friends  + invite_only |
 * | friends  + request              | friends, owner approves   | friends  + public, require_approval |
 * | unlisted + open                 | room code holders         | private  + public |
 * | unlisted + friends              | room code holders + friends | private + friends |
 * | unlisted + invite_only          | invited / approved only   | private  + invite_only |
 * | unlisted + request              | room code, owner approves  | private  + public, require_approval |
 *
 * The one deliberate widening: a legacy `unlisted + friends` Session used to need
 * the room code even for friends; afterwards friends may join directly. Adding a
 * friend is already an owner decision, and `visibility = private` still keeps the
 * Session out of every list.
 */
export class MultiplayerVisibilityJoinPolicySplit1720000380000 implements MigrationInterface {
  name = 'MultiplayerVisibilityJoinPolicySplit1720000380000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await tableExists(queryRunner, TABLE))) return;

    // 1. `require_approval` carries the removed `request` policy. Added nullable-safe
    //    (NOT NULL DEFAULT 0) so the backfill below can flip it before the enum shrinks.
    await addColumnIfMissing(queryRunner, TABLE, 'require_approval', 'TINYINT(1) NOT NULL DEFAULT 0');

    // 2. Capture the legacy `request` policy before `join_policy` loses the value.
    //    A rerun matches no rows here, because step 3 already rewrote them.
    await queryRunner.query(
      `UPDATE \`${TABLE}\` SET require_approval = 1 WHERE join_policy = 'request'`,
    );

    // 3. Remap join_policy while the legacy `visibility` values are still readable.
    //
    //    Order matters and each rule is *exclusive* on its legacy value:
    //    `unlisted` rows must be resolved before the `private` rules, because the
    //    two share the same target vocabulary and a broader rule would otherwise
    //    consume a row another rule was meant to classify.
    //
    //    Every statement is idempotent — after the first run its WHERE clause
    //    matches nothing, so a re-run or a partially migrated database converges.
    const joinPolicyRemap: Array<[string, string]> = [
      // Hidden from lists: `visibility` was the only listing switch, so these rows
      // keep `private` and inherit their eligibility from the old join_policy.
      [`visibility = 'unlisted' AND join_policy = 'request'`, 'public'],
      [`visibility = 'unlisted' AND join_policy = 'open'`, 'public'],
      [`visibility = 'unlisted' AND join_policy = 'friends'`, 'friends'],
      [`visibility = 'unlisted' AND join_policy = 'invite_only'`, 'invite_only'],
      // `private` used to deny every un-invited join outright, so anything that was
      // not already an approved request becomes invite-only under the new model.
      [`visibility = 'private' AND join_policy = 'request'`, 'public'],
      [`visibility = 'private' AND join_policy IN ('open','friends','invite_only')`, 'invite_only'],
      // `friends` already gated on friendship, which `join_policy = friends` keeps.
      [`visibility = 'friends' AND join_policy = 'request'`, 'friends'],
      [`visibility = 'friends' AND join_policy IN ('open','friends')`, 'friends'],
    ];
    for (const [where, next] of joinPolicyRemap) {
      await queryRunner.query(
        `UPDATE \`${TABLE}\` SET join_policy = ? WHERE ${where} AND join_policy <> ?`,
        [next, next],
      );
    }

    // 4. `unlisted` becomes `private`; the room code (if any) keeps working because
    //    `join_policy` now carries that permission instead of the visibility value.
    await queryRunner.query(`UPDATE \`${TABLE}\` SET visibility = 'private' WHERE visibility = 'unlisted'`);

    // 5. Only now shrink both enums — every row is guaranteed to hold a legal value.
    await this.alignEnum(queryRunner, 'visibility', ['private', 'friends', 'public'], 'private');
    await this.alignEnum(queryRunner, 'join_policy', ['invite_only', 'friends', 'public'], 'friends');

    // 6. The public lobby lists by (visibility, status, expires_at).
    await createIndexIfMissing(queryRunner, TABLE, 'idx_multiplayer_sessions_discovery', ['visibility', 'status', 'expires_at']);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await tableExists(queryRunner, TABLE))) return;

    await this.alignEnum(queryRunner, 'visibility', ['private', 'friends', 'unlisted'], 'private');
    await this.alignEnum(queryRunner, 'join_policy', ['open', 'friends', 'request', 'invite_only'], 'friends');

    // Collapse the new fields back onto the legacy vocabulary. `require_approval`
    // becomes the `request` policy, which is its exact legacy spelling.
    await queryRunner.query(`UPDATE \`${TABLE}\` SET join_policy = 'request' WHERE require_approval = 1`);
    await queryRunner.query(`UPDATE \`${TABLE}\` SET join_policy = 'open' WHERE join_policy = 'public'`);
    // A `private + friends` room has no legacy equivalent other than `unlisted`
    // (`private` used to deny friends outright), and it is the closest restore.
    await queryRunner.query(
      `UPDATE \`${TABLE}\` SET visibility = 'unlisted' WHERE visibility = 'private' AND join_policy = 'friends'`,
    );

    await queryRunner.query('DROP INDEX `idx_multiplayer_sessions_discovery` ON `multiplayer_sessions`').catch(() => undefined);
    await queryRunner.query('ALTER TABLE `multiplayer_sessions` DROP COLUMN `require_approval`').catch(() => undefined);
  }

  /**
   * Rewrite an ENUM only when its allowed values differ, so the migration stays
   * idempotent and a fresh database (where the baseline already created the new
   * shape from entity metadata) emits no DDL at all.
   */
  private async alignEnum(queryRunner: QueryRunner, column: string, values: string[], fallback: string): Promise<void> {
    const rows: Array<{ COLUMN_TYPE: string }> = await queryRunner.query(
      `SELECT COLUMN_TYPE FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
      [TABLE, column],
    );
    const current = rows[0]?.COLUMN_TYPE;
    if (!current) return;
    const expected = `enum(${values.map((value) => `'${value}'`).join(',')})`;
    if (current.toLowerCase() === expected) return;
    await queryRunner.query(
      `ALTER TABLE \`${TABLE}\` MODIFY COLUMN \`${column}\` ENUM(${values.map((value) => `'${value}'`).join(',')})
        NOT NULL DEFAULT '${fallback}'`,
    );
  }
}
