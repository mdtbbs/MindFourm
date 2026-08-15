import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateUserDataDeletionRequests1720000039000 implements MigrationInterface {
  name = 'CreateUserDataDeletionRequests1720000039000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('user_data_deletion_requests'))) {
      await queryRunner.createTable(new Table({
        name: 'user_data_deletion_requests',
        columns: [
          { name: 'id', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
          { name: 'user_id', type: 'int' },
          { name: 'status', type: 'varchar', length: '20', default: "'pending'" },
          { name: 'request_reason', type: 'text', isNullable: true },
          { name: 'resolution', type: 'text', isNullable: true },
          { name: 'reviewed_by', type: 'int', isNullable: true },
          { name: 'reviewed_at', type: 'datetime', isNullable: true },
          { name: 'legal_hold_until', type: 'datetime', isNullable: true },
          { name: 'created_at', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'updated_at', type: 'datetime', default: 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' },
        ],
      }));
    }
    const table = await queryRunner.getTable('user_data_deletion_requests');
    if (!table) return;
    if (!table.indices.some((index) => index.name === 'idx_deletion_request_user_status')) {
      await queryRunner.createIndex(table, new TableIndex({ name: 'idx_deletion_request_user_status', columnNames: ['user_id', 'status'] }));
    }
    if (!table.indices.some((index) => index.name === 'idx_deletion_request_legal_hold')) {
      await queryRunner.createIndex(table, new TableIndex({ name: 'idx_deletion_request_legal_hold', columnNames: ['legal_hold_until'] }));
    }
    if (!table.foreignKeys.some((key) => key.name === 'fk_deletion_request_user')) {
      await queryRunner.createForeignKey(table, new TableForeignKey({ name: 'fk_deletion_request_user', columnNames: ['user_id'], referencedTableName: 'users', referencedColumnNames: ['id'], onDelete: 'CASCADE' }));
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('user_data_deletion_requests')) await queryRunner.dropTable('user_data_deletion_requests');
  }
}
