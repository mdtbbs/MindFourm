import { MigrationInterface, QueryRunner } from 'typeorm';
import { tableExists, columnExists } from './migration-utils';

/** Remove the old renderer's fake Build 1 value from persisted map metadata. */
export class RepairMindustryRendererBuildSentinel1720000057000 implements MigrationInterface {
  name = 'RepairMindustryRendererBuildSentinel1720000057000';
  transaction = false;

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!await tableExists(queryRunner, 'resources') || !await columnExists(queryRunner, 'resources', 'renderer_metadata_json')) return;
    await queryRunner.query(`
      UPDATE resources
      SET renderer_metadata_json = JSON_REMOVE(renderer_metadata_json, '$.build')
      WHERE renderer_metadata_json IS NOT NULL
        AND JSON_EXTRACT(renderer_metadata_json, '$.build') IS NOT NULL
        AND CAST(JSON_UNQUOTE(JSON_EXTRACT(renderer_metadata_json, '$.build')) AS UNSIGNED) <= 1
    `);
  }

  async down(): Promise<void> {}
}
