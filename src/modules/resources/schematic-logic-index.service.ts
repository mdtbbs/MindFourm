import { Injectable, Optional } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { auditMlogSource } from './analyzers/mlog-auditor';

type SqlExecutor = { query(sql: string, parameters?: unknown[]): Promise<any> };
type SnippetRow = {
  id: string | number;
  resource_id: number;
  resource_version_id: number;
  processor_key: string;
  processor_type: string;
  position_x: number | null;
  position_y: number | null;
  instruction_count: number;
  estimated_cycle_ticks: string | number | null;
  opcodes_json: unknown;
  referenced_units_json: unknown;
  referenced_blocks_json: unknown;
  has_warnings: number;
  findings_json: unknown;
  source_excerpt: string | null;
  resource_public_id: string;
  title: string;
  version_public_id: string;
  version: string | null;
  author_id: number | null;
  author_name: string | null;
  author_avatar_url: string | null;
};

export type LogicSnippetSearchQuery = {
  q?: string;
  opcode?: string;
  unit?: string;
  processor_type?: string;
  cursor?: string;
  limit?: number;
};

const PUBLIC_RESOURCE_SQL = `r.deleted_at IS NULL AND r.merged_into_resource_id IS NULL
  AND r.is_public = 1 AND r.status IN ('approved','published')
  AND (r.visibility IS NULL OR r.visibility <> 'private')`;

/** 公开逻辑片段索引的写入、清理与检索。索引只派生自已发布推荐版本。 */
@Injectable()
export class SchematicLogicIndexService {
  constructor(@Optional() private readonly dataSource?: DataSource) {}

  private executor(manager?: EntityManager | SqlExecutor): SqlExecutor {
    const executor = manager || this.dataSource;
    if (!executor) throw new Error('SchematicLogicIndexService requires a DataSource');
    return executor as SqlExecutor;
  }

  /** 资源必须是公开可读、版本必须已发布，索引才允许对外存在。 */
  private async isPublicRelease(executor: SqlExecutor, resourceId: number, versionId: number): Promise<boolean> {
    const rows = await executor.query(
      `SELECT r.id FROM resources r
       INNER JOIN resource_versions v ON v.resource_id=r.id AND v.id=? AND v.status='published'
       WHERE r.id=? AND r.resource_kind='schematic' AND ${PUBLIC_RESOURCE_SQL} LIMIT 1`,
      [versionId, resourceId],
    ) as Array<{ id: number }>;
    return rows.length > 0;
  }

  /**
   * 审核通过/状态恢复时重建索引。必须在发布事务内调用，保证公开状态与索引
   * 不会出现可观察的中间态。
   */
  async replacePublishedIndex(manager: EntityManager | SqlExecutor, resourceId: number, versionId: number): Promise<number> {
    const executor = this.executor(manager);
    if (!await this.isPublicRelease(executor, resourceId, versionId)) {
      await this.removeResource(resourceId, executor);
      return 0;
    }
    const resourceRows = await executor.query(
      'SELECT user_id,title FROM resources WHERE id=? LIMIT 1', [resourceId],
    ) as Array<{ user_id: number; title: string }>;
    const authorId = resourceRows[0]?.user_id == null ? null : Number(resourceRows[0].user_id);
    const resourceTitle = String(resourceRows[0]?.title || '');
    const processorRows = await executor.query(
      `SELECT id,position_x,position_y,processor_type,source_code,source_truncated,source_sha256,
              instruction_count,estimated_cycle_ticks,audit_findings_json,links_json
       FROM schematic_logic_processors WHERE resource_version_id=? ORDER BY id ASC LIMIT 500`,
      [versionId],
    ) as Array<Record<string, any>>;

    await this.removeResource(resourceId, executor);
    if (!processorRows.length) return 0;

    let inserted = 0;
    for (const [index, row] of processorRows.entries()) {
      const source = typeof row.source_code === 'string' ? row.source_code : '';
      const processorType = String(row.processor_type || 'logic-processor').slice(0, 64);
      const processorKey = `${row.position_x ?? ''}:${row.position_y ?? ''}:${processorType}`.slice(0, 128) || `processor-${index}`;
      // 发布时重新跑一次纯静态审计，保证 snippet 索引与当前审计器版本一致；
      // 分析阶段的结果只作为存储投影，不作为唯一事实来源。
      const audit = source ? auditMlogSource(source, {
        processorType,
        linkedBlocks: this.linkObjects(row.links_json),
      }) : null;
      const storedFindings = this.arrayValue(row.audit_findings_json);
      const findings = audit?.findings ?? storedFindings;
      const hasWarnings = audit?.has_warnings ?? findings.some((finding) => {
        const severity = String((finding as Record<string, unknown>)?.severity || '');
        return severity === 'warning' || severity === 'error';
      });
      const opcodes = audit?.opcodes ?? [];
      const referencedUnits = audit?.referenced_units ?? [];
      const referencedBlocks = audit?.referenced_blocks ?? this.linkNames(row.links_json);
      const instructionCount = audit?.instruction_count ?? Math.max(0, Number(row.instruction_count) || 0);
      const cycleTicks = audit?.estimated_cycle_ticks ?? (row.estimated_cycle_ticks == null ? null : Number(row.estimated_cycle_ticks));
      const sourceExcerpt = source ? source.slice(0, 2000) : null;
      const searchable = [
        resourceTitle,
        processorType,
        String(row.position_x ?? ''), String(row.position_y ?? ''),
        opcodes.join(' '), referencedUnits.join(' '), referencedBlocks.join(' '),
        audit?.searchable_text || source.slice(0, 60_000),
      ].filter(Boolean).join('\n').slice(0, 60_000);
      await executor.query(
        `INSERT INTO schematic_logic_snippets
          (resource_id,resource_version_id,processor_id,processor_key,processor_type,position_x,position_y,
           instruction_count,estimated_cycle_ticks,opcodes_json,referenced_units_json,referenced_blocks_json,
           has_warnings,findings_json,source_sha256,source_excerpt,searchable_text,author_user_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          resourceId, versionId, Number(row.id) || null, processorKey, processorType,
          row.position_x == null ? null : Number(row.position_x),
          row.position_y == null ? null : Number(row.position_y),
          instructionCount, cycleTicks,
          JSON.stringify(opcodes), JSON.stringify(referencedUnits), JSON.stringify(referencedBlocks),
          hasWarnings ? 1 : 0, JSON.stringify(findings.slice(0, 100)),
          typeof row.source_sha256 === 'string' ? row.source_sha256 : null,
          sourceExcerpt, searchable, authorId,
        ],
      );
      inserted += 1;
    }
    return inserted;
  }

  /** 资源状态/可见性变化后按当前推荐版本重算；没有可发布版本时清空索引。 */
  async syncResource(resourceId: number, manager?: EntityManager | SqlExecutor): Promise<number> {
    const executor = this.executor(manager);
    const rows = await executor.query(
      `SELECT v.id FROM resources r
       INNER JOIN resource_versions v ON v.resource_id=r.id
       WHERE r.id=? AND r.resource_kind='schematic' AND ${PUBLIC_RESOURCE_SQL}
         AND v.status='published' AND v.public_id IS NOT NULL
       ORDER BY v.recommended DESC, COALESCE(v.published_at,v.created_at) DESC, v.revision DESC, v.id DESC
       LIMIT 1`,
      [resourceId],
    ) as Array<{ id: number }>;
    const versionId = rows[0] ? Number(rows[0].id) : 0;
    if (!versionId) {
      await this.removeResource(resourceId, executor);
      return 0;
    }
    return this.replacePublishedIndex(executor, resourceId, versionId);
  }

  async removeResource(resourceId: number, manager?: EntityManager | SqlExecutor): Promise<void> {
    await this.executor(manager).query('DELETE FROM schematic_logic_snippets WHERE resource_id=?', [resourceId]);
  }

  /** 公开检索：匿名可读，过滤条件全部使用参数绑定。 */
  async search(query: LogicSnippetSearchQuery): Promise<{
    items: Array<Record<string, unknown>>;
    pagination: { next_cursor: string | null; has_more: boolean };
  }> {
    const executor = this.executor();
    const limit = Math.max(1, Math.min(50, Math.trunc(Number(query.limit) || 20)));
    const clauses: string[] = [PUBLIC_RESOURCE_SQL, "v.status='published'", 'v.public_id IS NOT NULL'];
    const parameters: unknown[] = [];

    const text = this.optionalText(query.q, 200);
    if (text) {
      clauses.push("(MATCH(s.searchable_text) AGAINST (? IN NATURAL LANGUAGE MODE) OR s.searchable_text LIKE ? ESCAPE '\\\\')");
      parameters.push(this.naturalLanguageQuery(text), `%${this.escapeLike(text)}%`);
    }
    const opcode = this.optionalText(query.opcode, 50);
    if (opcode) {
      if (!/^[a-z][a-z0-9_-]{0,49}$/i.test(opcode)) return { items: [], pagination: { next_cursor: null, has_more: false } };
      clauses.push('JSON_CONTAINS(s.opcodes_json, JSON_QUOTE(?))');
      parameters.push(opcode.toLowerCase());
    }
    const unit = this.optionalText(query.unit, 50);
    if (unit) {
      if (!/^[a-zA-Z0-9_.-]{1,50}$/.test(unit)) return { items: [], pagination: { next_cursor: null, has_more: false } };
      clauses.push('JSON_CONTAINS(s.referenced_units_json, JSON_QUOTE(?))');
      parameters.push(unit.toLowerCase());
    }
    const processorType = this.optionalText(query.processor_type, 64);
    if (processorType) {
      if (!/^[a-zA-Z0-9_.:-]{1,64}$/.test(processorType)) return { items: [], pagination: { next_cursor: null, has_more: false } };
      clauses.push('s.processor_type=?');
      parameters.push(processorType);
    }
    const cursor = this.decodeCursor(query.cursor);
    if (cursor !== null) {
      clauses.push('s.id < ?');
      parameters.push(cursor);
    }
    parameters.push(limit + 1);

    const rows = await executor.query(
      `SELECT s.id,s.resource_id,s.resource_version_id,s.processor_key,s.processor_type,
              s.position_x,s.position_y,s.instruction_count,s.estimated_cycle_ticks,
              s.opcodes_json,s.referenced_units_json,s.referenced_blocks_json,s.has_warnings,
              s.findings_json,s.source_excerpt,
              r.public_id AS resource_public_id,r.title,
              v.public_id AS version_public_id,v.version,
              u.id AS author_id,u.username AS author_name,u.avatar_url AS author_avatar_url
       FROM schematic_logic_snippets s
       INNER JOIN resources r ON r.id=s.resource_id
       INNER JOIN resource_versions v ON v.id=s.resource_version_id
       LEFT JOIN users u ON u.id=r.user_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY s.id DESC LIMIT ?`,
      parameters,
    ) as SnippetRow[];
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    return {
      items: page.map((row) => this.toPublicItem(row)),
      pagination: page.length && hasMore
        ? { next_cursor: this.encodeCursor(Number(page[page.length - 1].id)), has_more: true }
        : { next_cursor: null, has_more: false },
    };
  }

  private toPublicItem(row: SnippetRow): Record<string, unknown> {
    const findings = this.arrayValue(row.findings_json)
      .map((finding) => finding && typeof finding === 'object' ? finding as Record<string, unknown> : null)
      .filter((finding): finding is Record<string, unknown> => finding !== null)
      .slice(0, 20)
      .map((finding) => ({
        code: String(finding.code || ''),
        severity: ['error', 'warning', 'info'].includes(String(finding.severity)) ? String(finding.severity) : 'warning',
        message: String(finding.message || '').slice(0, 500),
        line: Number.isSafeInteger(Number(finding.line)) ? Number(finding.line) : null,
      }));
    return {
      id: Number(row.id),
      resource_public_id: String(row.resource_public_id),
      resource_url: `/resources/${row.resource_public_id}`,
      title: String(row.title || ''),
      version_public_id: String(row.version_public_id),
      version: row.version == null ? null : String(row.version),
      author: row.author_id == null ? null : {
        id: Number(row.author_id),
        username: row.author_name || '',
        avatar_url: row.author_avatar_url || null,
      },
      processor_type: String(row.processor_type || ''),
      position: { x: row.position_x == null ? null : Number(row.position_x), y: row.position_y == null ? null : Number(row.position_y) },
      instruction_count: Number(row.instruction_count) || 0,
      estimated_cycle_ticks: row.estimated_cycle_ticks == null ? null : Number(row.estimated_cycle_ticks),
      opcodes: this.stringArray(row.opcodes_json),
      referenced_units: this.stringArray(row.referenced_units_json),
      referenced_blocks: this.stringArray(row.referenced_blocks_json),
      has_warnings: Number(row.has_warnings) === 1,
      findings,
      source_excerpt: row.source_excerpt == null ? null : String(row.source_excerpt).slice(0, 2000),
    };
  }

  private optionalText(value: unknown, max: number): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, max) : null;
  }

  /** boolean mode 会被用户输入里的 +-<>() 破坏；natural language 对空白分词更稳。 */
  private naturalLanguageQuery(value: string): string {
    return value.replace(/[+\-<>()~*"@]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
  }

  private escapeLike(value: string): string {
    return value.replace(/[\\%_]/g, (character) => `\\${character}`);
  }

  private arrayValue(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch { return []; }
    }
    return [];
  }

  private stringArray(value: unknown): string[] {
    return this.uniqueStrings(this.arrayValue(value).map(String)).slice(0, 100);
  }

  private uniqueStrings(values: string[]): string[] {
    return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
  }

  private linkObjects(value: unknown): Array<{ name: string }> {
    return this.arrayValue(value).flatMap((link) => {
      if (!link || typeof link !== 'object') return [];
      const name = (link as Record<string, unknown>).name;
      return typeof name === 'string' ? [{ name }] : [];
    });
  }

  private linkNames(value: unknown): string[] {
    return this.uniqueStrings(this.arrayValue(value).flatMap((link) => {
      if (!link || typeof link !== 'object') return [];
      const name = (link as Record<string, unknown>).name;
      return typeof name === 'string' && /^[A-Za-z0-9_.:-]{1,100}$/.test(name) ? [name] : [];
    })).slice(0, 100);
  }

  private encodeCursor(id: number): string {
    return Buffer.from(JSON.stringify({ id }), 'utf8').toString('base64url');
  }

  private decodeCursor(cursor?: string): number | null {
    if (!cursor) return null;
    try {
      const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { id?: unknown };
      return Number.isSafeInteger(Number(parsed.id)) && Number(parsed.id) > 0 ? Number(parsed.id) : null;
    } catch { return null; }
  }
}
