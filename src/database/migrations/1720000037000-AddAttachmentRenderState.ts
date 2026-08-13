import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddAttachmentRenderState1720000037000 implements MigrationInterface {
  name = 'AddAttachmentRenderState1720000037000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('attachments');
    if (!table) return;
    const columns = [
      new TableColumn({ name: 'renderer_status', type: 'varchar', length: '20', isNullable: true }),
      new TableColumn({ name: 'renderer_resource_id', type: 'varchar', length: '100', isNullable: true }),
      new TableColumn({ name: 'renderer_error_code', type: 'varchar', length: '100', isNullable: true }),
    ];
    for (const column of columns) {
      if (!table.findColumnByName(column.name)) await queryRunner.addColumn('attachments', column);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('attachments');
    if (!table) return;
    for (const name of ['renderer_error_code', 'renderer_resource_id', 'renderer_status']) {
      if (table.findColumnByName(name)) await queryRunner.dropColumn('attachments', name);
    }
  }
}
