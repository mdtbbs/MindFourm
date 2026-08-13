import { MigrationInterface, QueryRunner } from 'typeorm';
import { columnExists, tableExists } from './migration-utils';

/**
 * Resource categories are intentionally flat. Keep the legacy column for
 * backwards-compatible schemas, but clear old parent links so no client can
 * observe a tree after the model has been flattened.
 */
export class FlattenResourceCategories1720000035000 implements MigrationInterface {
  name = 'FlattenResourceCategories1720000035000';
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (
      (await tableExists(queryRunner, 'resource_categories')) &&
      (await columnExists(queryRunner, 'resource_categories', 'parent_id'))
    ) {
      await queryRunner.query(
        'UPDATE `resource_categories` SET `parent_id` = NULL WHERE `parent_id` IS NOT NULL',
      );
    }
  }

  public async down(): Promise<void> {
    // Flattening is intentionally irreversible; the legacy column remains
    // available for old database schemas but its former relationships cannot
    // be reconstructed safely.
  }
}
