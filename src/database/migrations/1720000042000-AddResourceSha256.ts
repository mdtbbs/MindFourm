import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddResourceSha2561720000042000 implements MigrationInterface {
  name = 'AddResourceSha2561720000042000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const tableName of ['resources', 'resource_versions']) {
      const table = await queryRunner.getTable(tableName);
      if (table && !table.findColumnByName('content_hash')) {
        await queryRunner.addColumn(tableName, new TableColumn({
          name: 'content_hash', type: 'char', length: '64', isNullable: true,
        }));
      }
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const tableName of ['resource_versions', 'resources']) {
      const table = await queryRunner.getTable(tableName);
      if (table?.findColumnByName('content_hash')) {
        await queryRunner.dropColumn(tableName, 'content_hash');
      }
    }
  }
}
