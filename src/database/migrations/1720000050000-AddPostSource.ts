import { MigrationInterface, QueryRunner } from 'typeorm';
import { addColumnIfMissing, createIndexIfMissing, tableExists } from './migration-utils';

/**
 * Makes content provenance queryable without changing legacy routes or records.
 *
 * The default/backfill is intentionally USER: this repository currently stores
 * GitHub activity in developer_feed_entries rather than posts, and treating old
 * community data as automated would corrupt historical reporting.
 */
export class AddPostSource1720000050000 implements MigrationInterface {
  name = 'AddPostSource1720000050000';
  transaction = false;

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!await tableExists(queryRunner, 'posts')) return;
    await addColumnIfMissing(queryRunner, 'posts', 'source', "VARCHAR(32) NOT NULL DEFAULT 'USER'");
    await queryRunner.query("UPDATE posts SET source = 'USER' WHERE source IS NULL OR source = ''");
    await createIndexIfMissing(queryRunner, 'posts', 'idx_posts_source_status_activity', ['source', 'status', 'last_activity_at']);
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    // Deliberately retain the additive provenance column. Dropping it would erase
    // information collected after deployment, which is not a safe rollback.
  }
}
