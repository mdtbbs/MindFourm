import { MigrationInterface, QueryRunner, Table, TableColumn, TableIndex } from 'typeorm';
import {
  extractTiptapText,
  markdownToTiptapDocument,
  normalizeTiptapDocument,
  renderTiptapDocument,
} from '../../common/utils/tiptap-content.util';

const CONTENT_TABLES = ['posts', 'replies', 'resources'] as const;
const BATCH_SIZE = 100;

export class RichContentSchemaV21720000140000 implements MigrationInterface {
  name = 'RichContentSchemaV21720000140000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const tableName of CONTENT_TABLES) {
      if (!(await queryRunner.hasTable(tableName))) continue;
      const table = await queryRunner.getTable(tableName);
      if (!table?.findColumnByName('content_schema_version')) {
        await queryRunner.addColumn(tableName, new TableColumn({
          name: 'content_schema_version', type: 'tinyint', unsigned: true, isNullable: false, default: 1,
        }));
      }
    }

    await this.backfillContent(queryRunner);
    await this.addAttachmentDraftFields(queryRunner);
    await this.createCustomEmojiTable(queryRunner);
  }

  private async backfillContent(queryRunner: QueryRunner): Promise<void> {
    for (const tableName of CONTENT_TABLES) {
      if (!(await queryRunner.hasTable(tableName))) continue;
      const table = await queryRunner.getTable(tableName);
      if (!table?.findColumnByName('id') || !table.findColumnByName('content_json')) continue;
      let lastId = 0;
      while (true) {
        const rows = await queryRunner.query(
          'SELECT * FROM ' + tableName + ' WHERE id > ? AND content_schema_version < 2 ORDER BY id ASC LIMIT ' + BATCH_SIZE,
          [lastId],
        ) as Array<Record<string, any>>;
        if (!rows.length) break;
        for (const row of rows) {
        const id = Number(row.id);
        lastId = id;
        try {
            let stored: unknown = null;
            try { stored = typeof row.content_json === 'string' ? JSON.parse(row.content_json) : row.content_json; }
            catch { stored = null; }
            if (stored) {
              try {
                normalizeTiptapDocument(stored, { schemaVersion: 2, allowDraftAttachments: true });
                await queryRunner.query(
                  'UPDATE ' + tableName + ' SET content_schema_version = 2 WHERE id = ? AND content_schema_version < 2',
                  [id],
                );
                continue;
              } catch {
                // A malformed legacy JSON value is not authoritative. Convert the
                // untouched Markdown projection below; valid JSON above is never
                // overwritten by this migration.
              }
            }

            const markdown = String(row.content || row.description || '');
            if (!markdown.trim()) {
              await queryRunner.query(
                'UPDATE ' + tableName + ' SET content_schema_version = 2 WHERE id = ? AND content_schema_version < 2',
                [id],
              );
              continue;
            }
            const document = markdownToTiptapDocument(markdown);
            await queryRunner.query(
              'UPDATE ' + tableName + ' SET content_json = ?, content_html = ?, content_text = ?, content_schema_version = 2 WHERE id = ? AND content_schema_version < 2',
              [JSON.stringify(document), renderTiptapDocument(document), extractTiptapText(document), id],
            );
          } catch (error) {
            console.error('[RichContentSchemaV2] Unable to migrate ' + tableName + '#' + id + ': ' + String((error as Error)?.message || error));
          }
        }
        if (rows.length < BATCH_SIZE) break;
      }
    }
  }

  private async addAttachmentDraftFields(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('attachments'))) return;
    const table = await queryRunner.getTable('attachments');
    if (!table) return;
    const additions: TableColumn[] = [
      new TableColumn({ name: 'draft_token_hash', type: 'char', length: '64', isNullable: true }),
      new TableColumn({ name: 'draft_expires_at', type: 'datetime', isNullable: true }),
      new TableColumn({ name: 'draft_bound_at', type: 'datetime', isNullable: true }),
    ];
    for (const column of additions) {
      if (!table.findColumnByName(column.name)) await queryRunner.addColumn('attachments', column);
    }
    const refreshed = await queryRunner.getTable('attachments');
    if (refreshed && !refreshed.indices.some((index) => index.name === 'uq_attachments_draft_token_hash')) {
      await queryRunner.createIndex('attachments', new TableIndex({
        name: 'uq_attachments_draft_token_hash', columnNames: ['draft_token_hash'], isUnique: true,
      }));
    }
    if (refreshed && !refreshed.indices.some((index) => index.name === 'idx_attachments_draft_expiry')) {
      await queryRunner.createIndex('attachments', new TableIndex({
        name: 'idx_attachments_draft_expiry', columnNames: ['draft_expires_at'],
      }));
    }
  }

  private async createCustomEmojiTable(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('custom_emojis')) return;
    await queryRunner.createTable(new Table({
      name: 'custom_emojis',
      columns: [
        { name: 'id', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
        { name: 'name', type: 'varchar', length: '80' },
        { name: 'shortcode', type: 'varchar', length: '48' },
        { name: 'file_name', type: 'varchar', length: '255' },
        { name: 'file_path', type: 'varchar', length: '500' },
        { name: 'mime_type', type: 'varchar', length: '40' },
        { name: 'is_enabled', type: 'tinyint', default: 1 },
        { name: 'sort_order', type: 'int', default: 0 },
        { name: 'created_by_user_id', type: 'int' },
        { name: 'created_at', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        { name: 'updated_at', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
      ],
      indices: [
        { name: 'uq_custom_emojis_shortcode', columnNames: ['shortcode'], isUnique: true },
        { name: 'idx_custom_emojis_enabled_sort', columnNames: ['is_enabled', 'sort_order'] },
      ],
    }), true);
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    // Rich nodes and attachment draft state may have been written after deployment.
    // Retain the additive schema on rollback to avoid destroying canonical content.
  }
}
