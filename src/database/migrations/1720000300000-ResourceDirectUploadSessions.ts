import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class ResourceDirectUploadSessions1720000300000 implements MigrationInterface {
  name = 'ResourceDirectUploadSessions1720000300000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(new Table({
      name: 'resource_direct_upload_sessions',
      columns: [
        { name: 'id', type: 'char', length: '36', isPrimary: true },
        { name: 'user_id', type: 'int' },
        { name: 'resource_version_id', type: 'int' },
        { name: 'role', type: 'varchar', length: '50' },
        { name: 'filename', type: 'varchar', length: '500' },
        { name: 'size_bytes', type: 'bigint' },
        { name: 'mime_type', type: 'varchar', length: '100' },
        { name: 'sha256', type: 'char', length: '64', isNullable: true },
        { name: 'object_public_id', type: 'varchar', length: '128', isNullable: true },
        { name: 'resource_file_public_id', type: 'char', length: '36', isNullable: true },
        { name: 'expires_at', type: 'datetime' },
        { name: 'created_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
      ],
      indices: [new TableIndex({ name: 'idx_resource_direct_upload_owner_expiry', columnNames: ['user_id', 'expires_at'] })],
    }), true);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('resource_direct_upload_sessions', true);
  }
}
