import { MigrationInterface, QueryRunner } from 'typeorm';
import { addColumnIfMissing, createIndexIfMissing } from './migration-utils';

/**
 * `resources.updated_at` is TypeORM's automatic write timestamp, so unrelated
 * writes keep moving it. View and download counters in particular are ordinary
 * `manager.increment(Resource, ...)` updates, and TypeORM's UpdateQueryBuilder
 * always appends `updated_at = CURRENT_TIMESTAMP` to an update that does not set
 * it explicitly. Cards and the detail header therefore displayed the time of the
 * last view or download as if it were the resource's date.
 *
 * `published_at` is the explicit, author-meaningful publication time: the moment
 * the resource first became publicly visible. Backfill mirrors the previous
 * display value (`COALESCE(updated_at, created_at)`) so no resource loses a date
 * on the day this lands; later bumps stay honest because nothing writes to this
 * column except the approval transition.
 */
export class ResourcePublishedAt1720000350000 implements MigrationInterface {
  name = 'ResourcePublishedAt1720000350000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await addColumnIfMissing(queryRunner, 'resources', 'published_at', 'DATETIME NULL');
    await createIndexIfMissing(queryRunner, 'resources', 'idx_resources_published_at', ['status', 'is_public', 'published_at']);

    // Existing approved/published resources already have a meaningful
    // created_at; using it makes the backfill idempotent and stops a rerun from
    // overwriting a real publication timestamp with a later view/download bump.
    await queryRunner.query(
      `UPDATE resources
          SET published_at = COALESCE(published_at, created_at, updated_at)
        WHERE published_at IS NULL
          AND status IN ('approved', 'published')
          AND is_public = 1
          AND deleted_at IS NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX `idx_resources_published_at` ON `resources`').catch(() => undefined);
    await queryRunner.query('ALTER TABLE `resources` DROP COLUMN `published_at`').catch(() => undefined);
  }
}
