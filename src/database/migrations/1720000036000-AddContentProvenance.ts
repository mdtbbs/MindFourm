import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddContentProvenance1720000036000 implements MigrationInterface {
  name = 'AddContentProvenance1720000036000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const tableName of ['posts', 'replies']) {
      const table = await queryRunner.getTable(tableName);
      if (!table?.findColumnByName('ip_address')) {
        await queryRunner.addColumn(tableName, new TableColumn({ name: 'ip_address', type: 'varchar', length: '45', isNullable: true }));
      }
      if (!table?.findColumnByName('location_label')) {
        await queryRunner.addColumn(tableName, new TableColumn({ name: 'location_label', type: 'varchar', length: '100', isNullable: true }));
      }
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const tableName of ['posts', 'replies']) {
      const table = await queryRunner.getTable(tableName);
      if (table?.findColumnByName('location_label')) await queryRunner.dropColumn(tableName, 'location_label');
      if (table?.findColumnByName('ip_address')) await queryRunner.dropColumn(tableName, 'ip_address');
    }
  }
}
