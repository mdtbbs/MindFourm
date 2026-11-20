import { SchematicLogicIndexService } from './schematic-logic-index.service';

const RESOURCE_ID = 10;
const VERSION_ID = 100;

type Call = { sql: string; parameters?: unknown[] };

function harness(options: {
  publicRelease?: boolean; processors?: any[]; recommendedVersion?: number | null; searchRows?: any[]; resourceMissing?: boolean;
} = {}) {
  const calls: Call[] = [];
  const query = jest.fn(async (sql: string, parameters?: unknown[]) => {
    calls.push({ sql, parameters });
    if (sql.includes('INNER JOIN resource_versions v ON v.resource_id=r.id AND v.id=?')) {
      return options.publicRelease === false ? [] : [{ id: RESOURCE_ID }];
    }
    if (sql.includes('SELECT user_id,title FROM resources')) {
      return options.resourceMissing ? [] : [{ user_id: 7, title: '逻辑合集' }];
    }
    if (sql.includes('FROM schematic_logic_processors')) return options.processors ?? [];
    if (sql.includes('SELECT v.id FROM resources r')) {
      return options.recommendedVersion === null ? [] : [{ id: options.recommendedVersion ?? VERSION_ID }];
    }
    if (sql.includes('FROM schematic_logic_snippets s')) return options.searchRows ?? [];
    return [];
  });
  return { service: new SchematicLogicIndexService({ query } as any), calls, query };
}

describe('SchematicLogicIndexService', () => {
  it('rebuilds only from the published recommended version and stores static audit fields', async () => {
    const source = 'ubind @flare\njump 0 always';
    const { service, calls, query } = harness({
      processors: [{
        id: 501, position_x: 3, position_y: 4, processor_type: 'logic-processor',
        source_code: source, source_truncated: 0, source_sha256: 'b'.repeat(64),
        instruction_count: 2, estimated_cycle_ticks: 1, audit_findings_json: [],
        links_json: [{ name: 'cell1', x: 1, y: 2 }],
      }],
    });
    const inserted = await service.replacePublishedIndex({ query } as any, RESOURCE_ID, VERSION_ID);
    expect(inserted).toBe(1);
    const remove = calls.find((call) => call.sql.startsWith('DELETE FROM schematic_logic_snippets'));
    expect(remove).toBeTruthy();
    const insert = calls.find((call) => call.sql.includes('INSERT INTO schematic_logic_snippets'));
    expect(insert).toBeTruthy();
    expect(insert!.parameters?.slice(0, 8)).toEqual([RESOURCE_ID, VERSION_ID, 501, '3:4:logic-processor', 'logic-processor', 3, 4, 2]);
    expect(JSON.parse(String(insert!.parameters?.[9]))).toEqual(['jump', 'ubind']);
    expect(JSON.parse(String(insert!.parameters?.[10]))).toEqual(['flare']);
    expect(JSON.parse(String(insert!.parameters?.[11]))).toEqual(['cell1']);
    expect(String(insert!.parameters?.[16])).toContain('逻辑合集');
    expect(insert!.parameters?.[17]).toBe(7);
  });

  it('clears the index when the resource is not public', async () => {
    const { service, calls, query } = harness({ publicRelease: false });
    const inserted = await service.replacePublishedIndex({ query } as any, RESOURCE_ID, VERSION_ID);
    expect(inserted).toBe(0);
    expect(calls.some((call) => call.sql.includes('INSERT INTO schematic_logic_snippets'))).toBe(false);
    expect(calls.some((call) => call.sql.startsWith('DELETE FROM schematic_logic_snippets'))).toBe(true);
  });

  it('syncs to the recommended published version and removes the index when none exists', async () => {
    const { service, calls } = harness({ recommendedVersion: VERSION_ID, processors: [] });
    await service.syncResource(RESOURCE_ID);
    const insert = calls.find((call) => call.sql.includes('INSERT INTO schematic_logic_snippets'));
    expect(insert).toBeUndefined();
    expect(calls.some((call) => call.sql.startsWith('DELETE FROM schematic_logic_snippets'))).toBe(true);

    const empty = harness({ recommendedVersion: null });
    await empty.service.syncResource(RESOURCE_ID);
    expect(empty.calls.some((call) => call.sql.startsWith('DELETE FROM schematic_logic_snippets'))).toBe(true);
  });

  it('returns public rows with author, version and findings, without internal identifiers', async () => {
    const { service } = harness({ searchRows: [{
      id: '9', resource_id: 10, resource_version_id: 100, processor_key: '3:4:logic-processor',
      processor_type: 'logic-processor', position_x: 3, position_y: 4,
      instruction_count: 12, estimated_cycle_ticks: 6.5,
      opcodes_json: '["jump","ubind"]', referenced_units_json: '["flare"]', referenced_blocks_json: '["cell1"]',
      has_warnings: 1,
      findings_json: '[{"code":"MLOG_MEMORY_OUT_OF_RANGE","severity":"warning","message":"越界","line":2}]',
      source_excerpt: 'ubind @flare\njump 0 always',
      resource_public_id: '4ab5d671-8af6-4d16-8238-7b6fd4b0a240', title: '逻辑合集',
      version_public_id: '16d81bd0-90c7-48ed-a371-a81059aaddc9', version: '1.0.0',
      author_id: 7, author_name: 'builder', author_avatar_url: null,
    }] });
    const result = await service.search({ q: 'flare', limit: 20 });
    expect(result.items[0]).toMatchObject({
      id: 9,
      resource_public_id: '4ab5d671-8af6-4d16-8238-7b6fd4b0a240',
      resource_url: '/resources/4ab5d671-8af6-4d16-8238-7b6fd4b0a240',
      version_public_id: '16d81bd0-90c7-48ed-a371-a81059aaddc9',
      author: { id: 7, username: 'builder' },
      opcodes: ['jump', 'ubind'],
      referenced_units: ['flare'],
      has_warnings: true,
      findings: [{ code: 'MLOG_MEMORY_OUT_OF_RANGE', severity: 'warning', message: '越界', line: 2 }],
    });
    expect(result.pagination).toEqual({ next_cursor: null, has_more: false });
    expect((result.items[0] as any).resource_id).toBeUndefined();
    expect((result.items[0] as any).resource_version_id).toBeUndefined();
  });

  it('applies bound filters and a cursor without string interpolation', async () => {
    const { service, calls } = harness({ searchRows: [{ id: 5, resource_id: 1, resource_version_id: 2, processor_type: 'logic-processor', instruction_count: 1, has_warnings: 0, opcodes_json: [], referenced_units_json: [], referenced_blocks_json: [], findings_json: [], resource_public_id: '4ab5d671-8af6-4d16-8238-7b6fd4b0a240', title: 't', version_public_id: '16d81bd0-90c7-48ed-a371-a81059aaddc9' }] });
    const cursor = Buffer.from(JSON.stringify({ id: 9 }), 'utf8').toString('base64url');
    await service.search({ q: 'loop + test', opcode: 'ubind', unit: 'flare', processor_type: 'logic-processor', cursor, limit: 2 });
    const select = calls.find((call) => call.sql.includes('FROM schematic_logic_snippets s'))!;
    expect(select.sql).toContain('MATCH(s.searchable_text) AGAINST (? IN NATURAL LANGUAGE MODE)');
    expect(select.sql).toContain("s.searchable_text LIKE ? ESCAPE '\\\\'");
    expect(select.sql).toContain('JSON_CONTAINS(s.opcodes_json, JSON_QUOTE(?))');
    expect(select.sql).toContain('JSON_CONTAINS(s.referenced_units_json, JSON_QUOTE(?))');
    expect(select.sql).toContain('s.id < ?');
    expect(select.parameters).toEqual(expect.arrayContaining(['loop test', '%loop + test%', 'ubind', 'flare', 'logic-processor', 9, 3]));
    expect(select.sql).not.toContain('loop');
  });

  it('short-circuits invalid filter values before querying', async () => {
    const { service, query } = harness();
    await expect(service.search({ opcode: "ubind'; DROP TABLE x; --" })).resolves.toEqual({ items: [], pagination: { next_cursor: null, has_more: false } });
    await expect(service.search({ unit: 'flare/../../x' })).resolves.toEqual({ items: [], pagination: { next_cursor: null, has_more: false } });
    expect(query).not.toHaveBeenCalled();
  });

  it('returns a next cursor when a full page has more rows', async () => {
    const rows = Array.from({ length: 3 }, (_, index) => ({
      id: 30 - index, resource_id: 1, resource_version_id: 2, processor_type: 'logic-processor',
      instruction_count: 1, has_warnings: 0, opcodes_json: [], referenced_units_json: [],
      referenced_blocks_json: [], findings_json: [], resource_public_id: '4ab5d671-8af6-4d16-8238-7b6fd4b0a240',
      title: 't', version_public_id: '16d81bd0-90c7-48ed-a371-a81059aaddc9',
    }));
    const { service } = harness({ searchRows: rows });
    const result = await service.search({ limit: 2 });
    expect(result.items).toHaveLength(2);
    expect(result.pagination.has_more).toBe(true);
    expect(JSON.parse(Buffer.from(result.pagination.next_cursor!, 'base64url').toString('utf8'))).toEqual({ id: 29 });
  });
});
