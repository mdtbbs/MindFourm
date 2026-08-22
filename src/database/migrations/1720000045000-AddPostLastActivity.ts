import { MigrationInterface, QueryRunner } from 'typeorm';
import { addColumnIfMissing, createIndexIfMissing } from './migration-utils';

/**
 * Materializes topic activity so public discussion lists do not aggregate the
 * replies table for every request. The backfill is idempotent for existing rows.
 */
export class AddPostLastActivity1720000045000 implements MigrationInterface {
  name = 'AddPostLastActivity1720000045000';
  transaction = false;

  async up(queryRunner: QueryRunner): Promise<void> {
    await addColumnIfMissing(queryRunner, 'posts', 'last_activity_at', 'DATETIME NULL');

    await queryRunner.query(`
      UPDATE posts post_row
      LEFT JOIN (
        SELECT post_id, MAX(created_at) AS latest_reply_at
        FROM replies
        WHERE deleted_at IS NULL AND status = 'published'
        GROUP BY post_id
      ) reply_activity ON reply_activity.post_id = post_row.id
      SET post_row.last_activity_at = COALESCE(reply_activity.latest_reply_at, post_row.created_at)
      WHERE post_row.last_activity_at IS NULL
    `);

    await queryRunner.query(
      'ALTER TABLE `posts` MODIFY COLUMN `last_activity_at` DATETIME NOT NULL',
    );
    await createIndexIfMissing(queryRunner, 'posts', 'idx_posts_deleted_status_last_activity', [
      'deleted_at', 'status', 'last_activity_at',
    ]);
  }

  async down(): Promise<void> {
    // Activity history is intentionally retained on rollback.
  }
}
