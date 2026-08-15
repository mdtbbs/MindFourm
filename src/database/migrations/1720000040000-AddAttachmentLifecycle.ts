import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class AddAttachmentLifecycle1720000040000 implements MigrationInterface {
  name = 'AddAttachmentLifecycle1720000040000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('attachments');
    if (!table) return;
    if (!table.findColumnByName('deleted_at')) {
      await queryRunner.addColumn('attachments', new TableColumn({ name: 'deleted_at', type: 'datetime', isNullable: true }));
    }
    const refreshed = await queryRunner.getTable('attachments');
    if (refreshed && !refreshed.indices.some((index) => index.name === 'idx_attachments_deleted_at')) {
      await queryRunner.createIndex('attachments', new TableIndex({ name: 'idx_attachments_deleted_at', columnNames: ['deleted_at'] }));
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('attachments');
    if (!table) return;
    if (table.indices.some((index) => index.name === 'idx_attachments_deleted_at')) await queryRunner.dropIndex('attachments', 'idx_attachments_deleted_at');
    if (table.findColumnByName('deleted_at')) await queryRunner.dropColumn('attachments', 'deleted_at');
  }
}
