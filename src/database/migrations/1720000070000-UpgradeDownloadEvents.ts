import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

/** Upgrade the legacy download_events placeholder created by migration 1720000027000. */
export class UpgradeDownloadEvents1720000070000 implements MigrationInterface {
  name = 'UpgradeDownloadEvents1720000070000';

  async up(queryRunner: QueryRunner): Promise<void> {
    let table = await queryRunner.getTable('download_events');
    if (!table) return;

    const additions: TableColumn[] = [];
    if (!table.findColumnByName('client_version')) additions.push(new TableColumn({ name: 'client_version', type: 'varchar', length: '80', isNullable: true }));
    if (!table.findColumnByName('dedup_key')) additions.push(new TableColumn({ name: 'dedup_key', type: 'char', length: '64', isNullable: true }));
    if (!table.findColumnByName('dedup_bucket')) additions.push(new TableColumn({ name: 'dedup_bucket', type: 'bigint', unsigned: true, isNullable: true }));
    if (additions.length) await queryRunner.addColumns('download_events', additions);

    table = await queryRunner.getTable('download_events');
    for (const columnName of ['version_id', 'file_id']) {
      const column = table?.findColumnByName(columnName);
      if (column && !column.isNullable) {
        const nullable = column.clone();
        nullable.isNullable = true;
        await queryRunner.changeColumn('download_events', column, nullable);
      }
    }

    table = await queryRunner.getTable('download_events');
    const indexes: TableIndex[] = [
      new TableIndex({ name: 'uq_download_events_dedup_bucket', columnNames: ['dedup_key', 'dedup_bucket'], isUnique: true }),
      new TableIndex({ name: 'idx_download_events_resource_created', columnNames: ['resource_id', 'created_at'] }),
      new TableIndex({ name: 'idx_download_events_file_created', columnNames: ['file_id', 'created_at'] }),
      new TableIndex({ name: 'idx_download_events_user_created', columnNames: ['user_id', 'created_at'] }),
      new TableIndex({ name: 'idx_download_events_type_created', columnNames: ['event_type', 'created_at'] }),
    ];
    for (const index of indexes) {
      if (!table?.indices.some((existing) => existing.name === index.name)) {
        await queryRunner.createIndex('download_events', index);
      }
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('download_events');
    if (!table) return;

    for (const name of [
      'uq_download_events_dedup_bucket',
      'idx_download_events_resource_created',
      'idx_download_events_file_created',
      'idx_download_events_user_created',
      'idx_download_events_type_created',
    ]) {
      const index = table.indices.find((item) => item.name === name);
      if (index) await queryRunner.dropIndex('download_events', index);
    }

    for (const name of ['client_version', 'dedup_key', 'dedup_bucket']) {
      if ((await queryRunner.getTable('download_events'))?.findColumnByName(name)) {
        await queryRunner.dropColumn('download_events', name);
      }
    }
    // Keep version_id/file_id nullable on rollback: newer lifecycle rows may
    // legitimately have no version/file, and narrowing them would lose data.
  }
}
