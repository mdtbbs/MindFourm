import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

/** Durable TTL-backed owner-bound quarantine drafts shared by resource upload facades. */
export class CreateResourceUploadDrafts1720000090000 implements MigrationInterface {
  name = 'CreateResourceUploadDrafts1720000090000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('resource_upload_drafts')) return;
    await queryRunner.createTable(new Table({
      name: 'resource_upload_drafts',
      columns: [
        { name: 'id', type: 'char', length: '36', isPrimary: true },
        { name: 'user_id', type: 'int' },
        { name: 'resource_kind', type: 'varchar', length: '50' },
        { name: 'file_path', type: 'varchar', length: '500' },
        { name: 'file_name', type: 'varchar', length: '255' },
        { name: 'file_size', type: 'bigint' },
        { name: 'mime_type', type: 'varchar', length: '100' },
        { name: 'content_hash', type: 'char', length: '64' },
        { name: 'preview_key', type: 'varchar', length: '500', isNullable: true },
        { name: 'metadata_json', type: 'json', isNullable: true },
        { name: 'parser_version', type: 'varchar', length: '100', isNullable: true },
        { name: 'draft_json', type: 'json', isNullable: true },
        { name: 'expires_at', type: 'datetime' },
        { name: 'created_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        { name: 'updated_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' },
      ],
      indices: [new TableIndex({ name: 'idx_resource_upload_drafts_owner_expiry', columnNames: ['user_id', 'expires_at'] })],
      foreignKeys: [new TableForeignKey({
        name: 'fk_resource_upload_drafts_user',
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      })],
    }), true);
  }

  async down(): Promise<void> {
    // Active quarantined files cannot be safely deleted from a schema rollback.
    // Expired records are garbage-collected by ResourcePreviewService.
  }
}
