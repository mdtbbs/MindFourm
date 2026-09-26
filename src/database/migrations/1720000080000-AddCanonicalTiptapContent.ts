import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/** Additive rich-text source and safe projections; Markdown remains a read-only compatibility projection. */
export class AddCanonicalTiptapContent1720000080000 implements MigrationInterface {
  name = 'AddCanonicalTiptapContent1720000080000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const tableName of ['posts', 'replies', 'resources']) {
      if (!(await queryRunner.hasTable(tableName))) continue;
      const table = await queryRunner.getTable(tableName);
      if (!table?.findColumnByName('content_json')) {
        await queryRunner.addColumn(tableName, new TableColumn({ name: 'content_json', type: 'json', isNullable: true }));
      }
      if (!table?.findColumnByName('content_text')) {
        await queryRunner.addColumn(tableName, new TableColumn({ name: 'content_text', type: 'text', isNullable: true }));
      }
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Keep migrated source and projections on rollback. Dropping the JSON column
    // would irreversibly remove richer structures after clients have written them.
  }
}
