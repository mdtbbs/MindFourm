import { MigrationInterface, QueryRunner } from 'typeorm';
import { createIndexIfMissing, dropIndexIfPresent } from './migration-utils';

const INDEXES: Array<{ table: string; name: string; columns: string[] }> = [
  // My resources query (getByUserId)
  { table: 'resources', name: 'idx_resources_user_id', columns: ['user_id'] },

  // Public list query: filter on (status, is_public) then order by created_at DESC
  { table: 'resources', name: 'idx_resources_public_list', columns: ['status', 'is_public', 'created_at'] },

  // Hot resources query: filter on (status, is_public) then order by download_count DESC
  { table: 'resources', name: 'idx_resources_hot', columns: ['status', 'is_public', 'download_count'] },

  // Category filter
  { table: 'resources', name: 'idx_resources_category', columns: ['category_id', 'status'] },
];

export class AddResourceIndexes1720000016000 implements MigrationInterface {
  name = 'AddResourceIndexes1720000016000';
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const { table, name, columns } of INDEXES) {
      await createIndexIfMissing(queryRunner, table, name, columns);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const { table, name } of INDEXES) {
      await dropIndexIfPresent(queryRunner, table, name);
    }
  }
}
