import { MigrationInterface, QueryRunner } from 'typeorm';
import { addColumnIfMissing, createIndexIfMissing, tableExists } from './migration-utils';

/** Persistent, forum-owned render state for approved Mindustry maps/schematics. */
export class AddResourceRenderState1720000053000 implements MigrationInterface {
  name = 'AddResourceRenderState1720000053000';
  transaction = false;

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!await tableExists(queryRunner, 'resources')) return;
    await addColumnIfMissing(queryRunner, 'resources', 'renderer_status', 'VARCHAR(20) NULL');
    await addColumnIfMissing(queryRunner, 'resources', 'renderer_error_code', 'VARCHAR(100) NULL');
    await addColumnIfMissing(queryRunner, 'resources', 'renderer_preview_key', 'VARCHAR(500) NULL');
    await addColumnIfMissing(queryRunner, 'resources', 'renderer_parser_version', 'VARCHAR(100) NULL');
    await addColumnIfMissing(queryRunner, 'resources', 'renderer_metadata_json', 'JSON NULL');
    await createIndexIfMissing(queryRunner, 'resources', 'idx_resources_renderer_status', ['renderer_status']);
  }

  // Additive columns are deliberately retained on rollback: dropping preview
  // state is not recoverable and column rollback is not portable across MySQL.
  async down(): Promise<void> {}
}
