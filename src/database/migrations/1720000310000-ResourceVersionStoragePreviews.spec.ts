import { ResourceVersionStoragePreviews1720000310000 } from './1720000310000-ResourceVersionStoragePreviews';

describe('ResourceVersionStoragePreviews migration', () => {
  it('adds nullable version and draft RES references while preserving historical keys', async () => {
    const query = jest.fn().mockResolvedValue([]);
    await new ResourceVersionStoragePreviews1720000310000().up({ query } as any);
    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toContain('ALTER TABLE resource_versions');
    expect(sql).toContain('renderer_preview_object_id VARCHAR(128) NULL');
    expect(sql).toContain('renderer_preview_binding_id VARCHAR(128) NULL');
    expect(sql).toContain('ALTER TABLE resource_upload_drafts');
    expect(sql).toContain('preview_object_id VARCHAR(128) NULL');
    expect(sql).toContain('preview_binding_id VARCHAR(128) NULL');
    expect(sql).not.toContain('DROP');
    expect(sql).not.toContain('preview_key');
  });

  it('reverts only newly added references', async () => {
    const query = jest.fn().mockResolvedValue([]);
    await new ResourceVersionStoragePreviews1720000310000().down({ query } as any);
    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toContain('DROP COLUMN renderer_preview_object_id');
    expect(sql).toContain('DROP COLUMN renderer_preview_binding_id');
    expect(sql).toContain('DROP COLUMN preview_object_id');
    expect(sql).toContain('DROP COLUMN preview_binding_id');
    expect(sql).not.toContain('preview_key');
  });
});
