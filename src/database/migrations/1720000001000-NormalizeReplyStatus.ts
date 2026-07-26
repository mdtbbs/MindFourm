import { MigrationInterface, QueryRunner } from 'typeorm';
import { tableExists } from './migration-utils';

/**
 * Collapse the two spellings of a visible reply onto `published`.
 *
 * `replies.status` was written as `published` by RepliesService and by admin
 * approval, but the entity defaulted to `active` and every reader counted `active`
 * — so `getReplyCount` returned 0 for every reply created through the application,
 * and posts displayed no replies at all. The vocabulary is now `published |
 * pending | deleted`, matching posts; this converts the rows written under the old
 * default.
 */
export class NormalizeReplyStatus1720000001000 implements MigrationInterface {
  name = 'NormalizeReplyStatus1720000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await tableExists(queryRunner, 'replies'))) return;

    await queryRunner.query(
      `UPDATE replies SET status = 'published' WHERE status = 'active'`,
    );
  }

  public async down(): Promise<void> {
    // Not reversible, and nothing is lost: `active` and `published` both meant
    // "visible", and which of the two a given row carried is unrecoverable.
  }
}
