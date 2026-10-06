import { MigrationInterface, QueryRunner } from 'typeorm';
import { SEARCH_INDEX_CATALOG } from '../../modules/search/search-index.catalog';

/** MySQL maintains each FULLTEXT index on DML; this schema adds bounded repair audit state. */
export class SearchIndexMaintenance1720000320000 implements MigrationInterface {
  name = 'SearchIndexMaintenance1720000320000';
  transaction = false;

  async up(queryRunner: QueryRunner): Promise<void> {
    await this.assertCatalogColumns(queryRunner);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS search_index_maintenance_runs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      index_key VARCHAR(64) NOT NULL,
      action VARCHAR(16) NOT NULL,
      status VARCHAR(16) NOT NULL,
      actor_user_id INT NULL,
      details_json JSON NULL,
      error_message VARCHAR(500) NULL,
      started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME NULL,
      PRIMARY KEY (id),
      KEY idx_search_index_runs_key_started (index_key, started_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    for (const index of SEARCH_INDEX_CATALOG) {
      if (await this.hasIndex(queryRunner, index.table, index.name)) continue;
      const columns = index.columns.map((column) => `\`${column}\``).join(', ');
      await queryRunner.query(`ALTER TABLE \`${index.table}\` ADD FULLTEXT INDEX \`${index.name}\` (${columns})`);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const index of [...SEARCH_INDEX_CATALOG].reverse()) {
      if (await this.hasIndex(queryRunner, index.table, index.name)) {
        await queryRunner.query(`ALTER TABLE \`${index.table}\` DROP INDEX \`${index.name}\``);
      }
    }
    const [{ count = 0 } = {}] = await queryRunner.query('SELECT COUNT(*) AS count FROM search_index_maintenance_runs');
    if (Number(count) === 0) {
      await queryRunner.query('DROP TABLE IF EXISTS search_index_maintenance_runs');
    }
    // Keep maintenance audit rows when they exist; derived indexes are removed
    // safely, while operational history remains available after rollback.
  }

  private async hasIndex(queryRunner: QueryRunner, table: string, name: string): Promise<boolean> {
    const rows = await queryRunner.query(`SELECT 1 AS present FROM information_schema.statistics
      WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? LIMIT 1`, [table, name]);
    return rows.length > 0;
  }

  private async assertCatalogColumns(queryRunner: QueryRunner): Promise<void> {
    const tables = [...new Set(SEARCH_INDEX_CATALOG.map((index) => index.table))];
    const placeholders = tables.map(() => '?').join(', ');
    const columns = await queryRunner.query(`SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name IN (${placeholders})`, tables);
    const found = new Map<string, string>();
    for (const column of columns) {
      // mysql2 preserves the driver's column-label casing for information_schema
      // rows. In CI/prod this can be uppercase (TABLE_NAME/COLUMN_NAME/DATA_TYPE),
      // while mocks and some drivers return the requested lowercase labels.
      // Normalize both forms before validating the allowlisted catalog.
      const tableName = column.table_name ?? column.TABLE_NAME;
      const columnName = column.column_name ?? column.COLUMN_NAME;
      const dataType = column.data_type ?? column.DATA_TYPE;
      found.set(`${tableName}.${columnName}`, String(dataType).toLowerCase());
    }
    const textTypes = new Set(['char', 'varchar', 'tinytext', 'text', 'mediumtext', 'longtext']);
    for (const index of SEARCH_INDEX_CATALOG) {
      for (const column of index.columns) {
        const actualType = found.get(`${index.table}.${column}`);
        if (!actualType || !textTypes.has(actualType)) {
          throw new Error(`Search FULLTEXT catalog requires a character column: ${index.table}.${column}`);
        }
      }
    }
  }
}
