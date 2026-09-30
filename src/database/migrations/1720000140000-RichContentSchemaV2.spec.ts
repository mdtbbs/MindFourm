import { RichContentSchemaV21720000140000 } from './1720000140000-RichContentSchemaV2';

describe('RichContentSchemaV2 migration', () => {
  it('keeps valid JSON, converts legacy Markdown in batches, and records the schema version', async () => {
    const validJson = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'already canonical' }] }] };
    const contentRows: Record<string, any[]> = {
      posts: [
        { id: 1, content_json: validJson, content: 'Do not overwrite this projection.' },
        { id: 2, content_json: null, content: '# Legacy title\n\nLegacy body.' },
      ],
      replies: [],
      resources: [],
    };
    const updates: Array<{ sql: string; parameters: unknown[] }> = [];
    const columns = new Map<string, Set<string>>([
      ['posts', new Set(['id', 'content_json', 'content', 'content_html', 'content_text', 'content_schema_version'])],
      ['replies', new Set(['id', 'content_json', 'content', 'content_html', 'content_text', 'content_schema_version'])],
      ['resources', new Set(['id', 'content_json', 'content', 'description', 'content_html', 'content_text', 'content_schema_version'])],
      ['attachments', new Set(['id', 'file_path'])],
    ]);
    const tables: Record<string, any> = {};
    for (const [name, names] of columns) {
      tables[name] = {
        name,
        columns: [...names].map((columnName) => ({ name: columnName })),
        indices: [],
        findColumnByName(columnName: string) { return this.columns.find((column: any) => column.name === columnName); },
      };
    }
    const runner = {
      hasTable: jest.fn(async (name: string) => Boolean(tables[name])),
      getTable: jest.fn(async (name: string) => tables[name] || null),
      addColumn: jest.fn(async (name: string, column: { name: string }) => {
        tables[name].columns.push(column);
      }),
      createIndex: jest.fn(async (name: string, index: { name: string; columnNames: string[]; isUnique?: boolean }) => {
        tables[name].indices.push(index);
      }),
      createTable: jest.fn(async () => undefined),
      query: jest.fn(async (sql: string, parameters: unknown[] = []) => {
        const tableName = sql.match(/FROM (posts|replies|resources)/)?.[1];
        if (sql.startsWith('SELECT') && tableName) {
          const lastId = Number(parameters[0] || 0);
          return (contentRows[tableName] || []).filter((row) => row.id > lastId);
        }
        updates.push({ sql, parameters });
        return [];
      }),
    };

    await new RichContentSchemaV21720000140000().up(runner as any);

    const validRowUpdate = updates.find((update) => update.sql.includes('content_schema_version = 2 WHERE id = ?') && update.parameters[0] === 1);
    expect(validRowUpdate).toBeDefined();
    expect(validRowUpdate?.sql).not.toContain('content_json =');
    const legacyUpdate = updates.find((update) => update.sql.includes('content_json = ?') && update.parameters.at(-1) === 2);
    expect(legacyUpdate).toBeDefined();
    expect(JSON.parse(String(legacyUpdate?.parameters[0])).content[0]).toMatchObject({ type: 'heading', attrs: { level: 1 } });
    expect(legacyUpdate?.sql).toContain('content_html = ?');
    expect(legacyUpdate?.sql).toContain('content_text = ?');
    expect(runner.addColumn).toHaveBeenCalledWith('attachments', expect.objectContaining({ name: 'draft_token_hash' }));
  });

  it('keeps its rollback additive so a downgrade does not delete v2 data', async () => {
    const runner = { query: jest.fn(), dropColumn: jest.fn(), dropTable: jest.fn() };
    await new RichContentSchemaV21720000140000().down(runner as any);
    expect(runner.dropColumn).not.toHaveBeenCalled();
    expect(runner.dropTable).not.toHaveBeenCalled();
  });
});
