import { AddResourceStorageReferences1720000290000 } from './1720000290000-AddResourceStorageReferences';

describe('AddResourceStorageReferences migration', () => {
  it('adds nullable RES references without changing historic MFL provider_file_id', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const migration = new AddResourceStorageReferences1720000290000();
    await migration.up({ query } as any);
    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toContain('provider_object_id VARCHAR(128) NULL');
    expect(sql).toContain('provider_binding_id VARCHAR(128) NULL');
    expect(sql).toContain('renderer_preview_object_id VARCHAR(128) NULL');
    expect(sql).not.toMatch(/MODIFY\s+provider_file_id/i);
  });

  it('reverses only its new columns', async () => {
    const query = jest.fn().mockResolvedValue([]);
    await new AddResourceStorageReferences1720000290000().down({ query } as any);
    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toContain('DROP COLUMN provider_object_id');
    expect(sql).toContain('DROP COLUMN provider_binding_id');
    expect(sql).toContain('DROP COLUMN renderer_preview_object_id');
    expect(sql).not.toContain('DROP COLUMN provider_file_id');
  });
});
