import { MigrationInterface, QueryRunner } from 'typeorm';
import { addColumnIfMissing, columnExists, createIndexIfMissing, dropIndexIfPresent, indexExists, tableExists } from './migration-utils';

/** Additive and idempotent on MySQL 5.7; virtual projections follow every renderer update. */
export class ForumPerformance1720000190000 implements MigrationInterface {
  name = 'ForumPerformance1720000190000';
  transaction = false;
  async up(q: QueryRunner): Promise<void> {
    await addColumnIfMissing(q, 'notifications', 'deduplication_key', 'VARCHAR(120) NULL');
    if (await tableExists(q, 'notifications') && !(await indexExists(q, 'notifications', 'uq_notifications_deduplication'))) {
      await q.query('CREATE UNIQUE INDEX `uq_notifications_deduplication` ON `notifications` (`deduplication_key`)');
    }
    await addColumnIfMissing(q, 'outbox_events', 'next_attempt_at', 'DATETIME NULL');
    await createIndexIfMissing(q, 'outbox_events', 'idx_outbox_retry', ['status', 'next_attempt_at', 'id']);
    await addColumnIfMissing(q, 'resources', 'filter_planet', "VARCHAR(80) GENERATED ALWAYS AS (LEFT(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(renderer_metadata_json, '$.planet')), 'null'), 80)) VIRTUAL");
    for (const dimension of ['width', 'height']) {
      await addColumnIfMissing(q, 'resources', `filter_${dimension}`, `INT UNSIGNED GENERATED ALWAYS AS (CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(renderer_metadata_json, '$.${dimension}')) REGEXP '^[0-9]{1,4}$' THEN CAST(JSON_UNQUOTE(JSON_EXTRACT(renderer_metadata_json, '$.${dimension}')) AS UNSIGNED) ELSE NULL END) VIRTUAL`);
    }
    for (const field of ['planet', 'width', 'height']) await createIndexIfMissing(q, 'resources', `idx_resources_filter_${field}`, [`filter_${field}`, 'status', 'is_public', 'deleted_at']);
    await createIndexIfMissing(q, 'resources', 'idx_resources_public_updated', ['deleted_at', 'is_public', 'status', 'updated_at', 'id']);
    await createIndexIfMissing(q, 'download_events', 'idx_download_trend', ['event_type', 'created_at', 'resource_id']);
    await createIndexIfMissing(q, 'resource_likes', 'idx_resource_likes_trend', ['created_at', 'resource_id']);
    await createIndexIfMissing(q, 'resource_favorites', 'idx_resource_favorites_trend', ['created_at', 'resource_id']);

  }
  async down(q: QueryRunner): Promise<void> {
    for (const [table, index] of [['resources', 'idx_resources_public_updated'], ['download_events', 'idx_download_trend'], ['resource_likes', 'idx_resource_likes_trend'], ['resource_favorites', 'idx_resource_favorites_trend'], ['outbox_events', 'idx_outbox_retry'], ['notifications', 'uq_notifications_deduplication']]) await dropIndexIfPresent(q, table, index);
    for (const field of ['planet', 'width', 'height']) {
      await dropIndexIfPresent(q, 'resources', `idx_resources_filter_${field}`);
      if (await columnExists(q, 'resources', `filter_${field}`)) await q.query(`ALTER TABLE resources DROP COLUMN filter_${field}`);
    }
    // Retain nullable delivery metadata during a code rollback to avoid losing deduplication.
  }
}
