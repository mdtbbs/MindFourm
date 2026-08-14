import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateLegalAcceptances1720000038000 implements MigrationInterface {
  name = 'CreateLegalAcceptances1720000038000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('legal_acceptances'))) {
      await queryRunner.createTable(new Table({
        name: 'legal_acceptances',
        columns: [
          { name: 'id', type: 'int', unsigned: true, isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
          { name: 'user_id', type: 'int', unsigned: true, isNullable: true },
          { name: 'terms_version', type: 'varchar', length: '71' },
          { name: 'terms_content_hash', type: 'char', length: '64' },
          { name: 'privacy_version', type: 'varchar', length: '71' },
          { name: 'privacy_content_hash', type: 'char', length: '64' },
          { name: 'ip_address', type: 'varchar', length: '45', isNullable: true },
          { name: 'user_agent', type: 'text', isNullable: true },
          { name: 'accepted_at', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
      }));
    }

    const table = await queryRunner.getTable('legal_acceptances');
    if (!table) return;

    if (!table.indices.some((index) => index.name === 'idx_legal_acceptances_user_accepted')) {
      await queryRunner.createIndex('legal_acceptances', new TableIndex({
        name: 'idx_legal_acceptances_user_accepted',
        columnNames: ['user_id', 'accepted_at'],
      }));
    }
    if (!table.indices.some((index) => index.name === 'idx_legal_acceptances_accepted_at')) {
      await queryRunner.createIndex('legal_acceptances', new TableIndex({
        name: 'idx_legal_acceptances_accepted_at',
        columnNames: ['accepted_at'],
      }));
    }
    if (!table.foreignKeys.some((foreignKey) => foreignKey.columnNames.length === 1 && foreignKey.columnNames[0] === 'user_id')) {
      await queryRunner.createForeignKey('legal_acceptances', new TableForeignKey({
        name: 'fk_legal_acceptances_user',
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }));
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('legal_acceptances')) {
      await queryRunner.dropTable('legal_acceptances');
    }
  }
}
