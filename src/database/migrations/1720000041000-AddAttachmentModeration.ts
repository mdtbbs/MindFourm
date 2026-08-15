import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class AddAttachmentModeration1720000041000 implements MigrationInterface {
  name = 'AddAttachmentModeration1720000041000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('attachments');
    if (!table) return;
    // Existing files were already publicly reachable before this release. Keep
    // them available; the entity explicitly assigns `pending` to new uploads.
    if (!table.findColumnByName('status')) {
      await queryRunner.addColumn('attachments', new TableColumn({
        name: 'status', type: 'varchar', length: '20', default: "'approved'",
      }));
    }
    const refreshed = await queryRunner.getTable('attachments');
    if (refreshed && !refreshed.indices.some((index) => index.name === 'idx_attachments_status_deleted_at')) {
      await queryRunner.createIndex('attachments', new TableIndex({
        name: 'idx_attachments_status_deleted_at', columnNames: ['status', 'deleted_at'],
      }));
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('attachments');
    if (!table) return;
    if (table.indices.some((index) => index.name === 'idx_attachments_status_deleted_at')) await queryRunner.dropIndex('attachments', 'idx_attachments_status_deleted_at');
    if (table.findColumnByName('status')) await queryRunner.dropColumn('attachments', 'status');
  }
}
