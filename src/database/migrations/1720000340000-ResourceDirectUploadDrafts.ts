import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

/** Durable idempotency and expiry state for metadata-first direct uploads. */
export class ResourceDirectUploadDrafts1720000340000 implements MigrationInterface {
  name = 'ResourceDirectUploadDrafts1720000340000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(new Table({
      name: 'resource_direct_upload_drafts',
      columns: [
        { name: 'id', type: 'char', length: '36', isPrimary: true },
        { name: 'resource_version_id', type: 'int' },
        { name: 'user_id', type: 'int' },
        { name: 'idempotency_key_hash', type: 'char', length: '64' },
        { name: 'request_fingerprint', type: 'char', length: '64' },
        { name: 'request_metadata', type: 'json', isNullable: true },
        { name: 'status', type: 'varchar', length: '20', default: "'open'" },
        { name: 'expires_at', type: 'datetime' },
        { name: 'completed_at', type: 'datetime', isNullable: true },
        { name: 'created_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
      ],
      uniques: [
        { name: 'uq_resource_direct_upload_draft_version', columnNames: ['resource_version_id'] },
        { name: 'uq_resource_direct_upload_draft_user_key', columnNames: ['user_id', 'idempotency_key_hash'] },
      ],
      indices: [new TableIndex({ name: 'idx_resource_direct_upload_draft_expiry', columnNames: ['status', 'expires_at'] })],
    }), true);
    await queryRunner.createForeignKey('resource_direct_upload_drafts', new TableForeignKey({
      name: 'fk_resource_direct_upload_draft_version',
      columnNames: ['resource_version_id'],
      referencedTableName: 'resource_versions',
      referencedColumnNames: ['id'],
      onDelete: 'CASCADE',
    }));
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('resource_direct_upload_drafts', true);
  }
}
