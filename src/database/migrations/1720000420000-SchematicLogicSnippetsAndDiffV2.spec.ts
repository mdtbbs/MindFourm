import { SchematicLogicSnippetsAndDiffV21720000420000 } from './1720000420000-SchematicLogicSnippetsAndDiffV2';

describe('SchematicLogicSnippetsAndDiffV2 migration', () => {
  it('extends processors with inert source and audit projections', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await new SchematicLogicSnippetsAndDiffV21720000420000().up({ query } as any);
    const ddl = query.mock.calls.map(([sql]) => String(sql)).join('\n');

    expect(ddl).toContain('ALTER TABLE schematic_logic_processors');
    expect(ddl).toContain('ADD COLUMN source_code MEDIUMTEXT NULL');
    expect(ddl).toContain('ADD COLUMN source_truncated TINYINT UNSIGNED NOT NULL DEFAULT 0');
    expect(ddl).toContain('ADD COLUMN source_sha256 CHAR(64) NULL');
    expect(ddl).toContain('ADD COLUMN instruction_count INT UNSIGNED NOT NULL DEFAULT 0');
    expect(ddl).toContain('ADD COLUMN estimated_cycle_ticks DECIMAL(10,2) NULL');
    expect(ddl).toContain('ADD COLUMN audit_findings_json JSON NULL');
  });

  it('creates the public logic snippet index with a FULLTEXT search column', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await new SchematicLogicSnippetsAndDiffV21720000420000().up({ query } as any);
    const ddl = query.mock.calls.map(([sql]) => String(sql)).join('\n');

    expect(ddl).toContain('CREATE TABLE schematic_logic_snippets');
    expect(ddl).toContain('FULLTEXT KEY ft_schematic_logic_snippets_searchable (searchable_text)');
    expect(ddl).toContain('UNIQUE KEY uq_schematic_logic_snippets_version_processor (resource_version_id, processor_key)');
    expect(ddl).toContain('has_warnings TINYINT UNSIGNED NOT NULL DEFAULT 0');
    expect(ddl).toContain('source_excerpt MEDIUMTEXT NULL');
  });

  it('drops the snippet table before restoring the processor columns', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await new SchematicLogicSnippetsAndDiffV21720000420000().down({ query } as any);
    const statements = query.mock.calls.map(([sql]) => String(sql));

    expect(statements[0]).toContain('DROP TABLE IF EXISTS schematic_logic_snippets');
    expect(statements[1]).toContain('ALTER TABLE schematic_logic_processors');
    expect(statements[1]).toContain('DROP COLUMN source_code');
  });
});
