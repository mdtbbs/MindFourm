import { ConflictException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SEARCH_INDEX_CATALOG, SearchIndexAction } from './search-index.catalog';

const MAINTENANCE_LOCK = 'mindforum:search-index-maintenance';

function field(row: Record<string, unknown> | undefined, lower: string, upper: string): unknown {
  return row?.[lower] ?? row?.[upper];
}

@Injectable()
export class SearchIndexMaintenanceService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getStatus() {
    const [versionRow] = await this.dataSource.query('SELECT VERSION() AS version');
    const results = await Promise.all(SEARCH_INDEX_CATALOG.map(async (index) => {
      const [actual] = await this.dataSource.query(`SELECT index_name, index_type,
          GROUP_CONCAT(column_name ORDER BY seq_in_index SEPARATOR ',') AS columns_in_order
        FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?
        GROUP BY index_name, index_type`, [index.table, index.name]);
      const [table] = await this.dataSource.query(`SELECT engine, table_rows FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = ?`, [index.table]);
      const [latestRun] = await this.dataSource.query(`SELECT id, action, status, actor_user_id, details_json,
          error_message, started_at, completed_at
        FROM search_index_maintenance_runs WHERE index_key = ? ORDER BY id DESC LIMIT 1`, [index.key]);
      const actualRow = actual as Record<string, unknown> | undefined;
      const tableRow = table as Record<string, unknown> | undefined;
      const actualType = String(field(actualRow, 'index_type', 'INDEX_TYPE') || '');
      const actualColumns = String(field(actualRow, 'columns_in_order', 'COLUMNS_IN_ORDER') || '');
      const expectedColumns = index.columns.join(',');
      const ready = actualType === 'FULLTEXT' && actualColumns === expectedColumns;
      return {
        key: index.key,
        table: index.table,
        index_name: index.name,
        columns: [...index.columns],
        status: ready ? 'ready' : actual ? 'drift' : 'missing',
        actual: actual ? { type: actualType, columns: actualColumns } : null,
        engine: field(tableRow, 'engine', 'ENGINE') || null,
        estimated_rows: Number(field(tableRow, 'table_rows', 'TABLE_ROWS') || 0),
        latest_run: latestRun || null,
      };
    }));
    const version = versionRow as Record<string, unknown> | undefined;
    return {
      engine_version: String(field(version, 'version', 'VERSION') || 'unknown'),
      maintenance: 'MySQL FULLTEXT indexes update on INSERT, UPDATE, and DELETE. Repair and rebuild operate on one allowlisted index per request.',
      indexes: results,
    };
  }

  async run(indexKey: string, action: SearchIndexAction, actorUserId: number) {
    const index = SEARCH_INDEX_CATALOG.find((item) => item.key === indexKey);
    if (!index) throw new NotFoundException('Search index not found');
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    let runId: number | null = null;
    let acquired = false;
    const startedAt = Date.now();
    try {
      const [lockRow] = await runner.query('SELECT GET_LOCK(?, 0) AS acquired', [MAINTENANCE_LOCK]);
      acquired = Number(lockRow?.acquired) === 1;
      if (!acquired) throw new ConflictException('Search index maintenance is already running');
      const inserted = await runner.query(`INSERT INTO search_index_maintenance_runs
        (index_key, action, status, actor_user_id, details_json, started_at)
        VALUES (?, ?, 'running', ?, ?, NOW())`, [index.key, action, actorUserId, JSON.stringify({ table: index.table, columns: index.columns })]);
      runId = Number(inserted.insertId);

      const [actual] = await runner.query(`SELECT index_name, index_type,
          GROUP_CONCAT(column_name ORDER BY seq_in_index SEPARATOR ',') AS columns_in_order
        FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?
        GROUP BY index_name, index_type`, [index.table, index.name]);
      const columns = index.columns.map((column) => `\`${column}\``).join(', ');
      if (actual) {
        await runner.query(`ALTER TABLE \`${index.table}\` DROP INDEX \`${index.name}\`, ADD FULLTEXT INDEX \`${index.name}\` (${columns})`);
      } else {
        await runner.query(`ALTER TABLE \`${index.table}\` ADD FULLTEXT INDEX \`${index.name}\` (${columns})`);
      }
      const completed = {
        index_name: index.name,
        columns: [...index.columns],
        elapsed_ms: Date.now() - startedAt,
      };
      await runner.query(`UPDATE search_index_maintenance_runs SET status = 'completed', details_json = ?, completed_at = NOW()
        WHERE id = ?`, [JSON.stringify(completed), runId]);
      return { id: runId, index_key: index.key, action, status: 'completed', ...completed };
    } catch (error) {
      if (runId !== null) {
        const message = error instanceof Error ? error.message.slice(0, 500) : 'Unknown index maintenance error';
        await runner.query(`UPDATE search_index_maintenance_runs SET status = 'failed', error_message = ?,
          details_json = ?, completed_at = NOW() WHERE id = ?`, [message, JSON.stringify({ elapsed_ms: Date.now() - startedAt }), runId]).catch(() => undefined);
      }
      if (error instanceof ConflictException || error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('Search index maintenance failed; inspect the admin status for details');
    } finally {
      if (acquired) await runner.query('SELECT RELEASE_LOCK(?)', [MAINTENANCE_LOCK]).catch(() => undefined);
      await runner.release();
    }
  }
}
