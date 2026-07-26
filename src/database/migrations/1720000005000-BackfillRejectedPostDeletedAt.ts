import { MigrationInterface, QueryRunner } from 'typeorm';
import { columnExists, tableExists } from './migration-utils';

/**
 * Stamp `deleted_at` on posts that were rejected without one.
 *
 * `AdminService.rejectPost` set `status = 'deleted'` but left `deleted_at` NULL,
 * while `cleanupSoftDeleted` purges on `deleted_at < cutoff` — so rejected posts
 * were retained forever and never counted towards the retention window.
 * `updated_at` is the closest available approximation of the rejection time.
 */
export class BackfillRejectedPostDeletedAt1720000005000 implements MigrationInterface {
  name = 'BackfillRejectedPostDeletedAt1720000005000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await tableExists(queryRunner, 'posts'))) return;
    if (!(await columnExists(queryRunner, 'posts', 'deleted_at'))) return;

    await queryRunner.query(
      `UPDATE posts
          SET deleted_at = updated_at
        WHERE status = 'deleted'
          AND deleted_at IS NULL`,
    );
  }

  public async down(): Promise<void> {
    // Clearing these again would re-create the retention leak, and the rows that
    // were backfilled are indistinguishable from ones deleted normally.
  }
}
