import { ResourceStorageReconciliationService } from './resource-storage-reconciliation.service';

const sha256 = 'a'.repeat(64);

describe('ResourceStorageReconciliationService', () => {
  function createHarness() {
    const localRows = [{
          id: 1, public_id: 'file-1', resource_version_id: 10, storage_backend: 'res', provider_object_id: 'object-1', provider_binding_id: 'binding-old',
          content_hash: sha256, size_bytes: 4, mime_type: 'application/octet-stream', integrity_status: 'verified', availability_status: 'available',
          resource_public_id: 'resource-1', resource_status: 'approved', resource_is_public: 1, resource_visibility: 'public', resource_deleted_at: null, version_status: 'published',
        }];
    const dataSource = {
      query: jest.fn((sql: string) => sql.includes('SELECT f.id') ? Promise.resolve(localRows) : Promise.resolve({ affectedRows: 1 })),
      transaction: jest.fn(async (callback: (manager: any) => Promise<unknown>) => callback({ query: jest.fn().mockResolvedValue({ affectedRows: 1 }) })),
    };
    const storage = {
      listAdminObjectInventory: jest.fn().mockResolvedValue({ items: [{ public_id: 'object-1', sha256, size_bytes: 4, mime_type: 'application/octet-stream', original_filename: 'x.bin', state: 'verified', created_at: '', verified_at: '', binding_count: 1 }], next_cursor: null }),
      listAdminBindingInventory: jest.fn().mockResolvedValue({ items: [{ binding_id: 'binding-old', object_public_id: 'object-1', sha256, size_bytes: 4, object_state: 'verified', namespace: 'mindforum', owner_type: 'resource_file', owner_id: 'file-1', visibility: 'private', created_at: '' }], next_cursor: null }),
      createBinding: jest.fn().mockResolvedValue({ id: 'binding-new' }),
    };
    return { service: new ResourceStorageReconciliationService(dataSource as any, storage as any), dataSource, storage };
  }

  it('reports publication mismatch without changing state during a read-only scan', async () => {
    const { service, dataSource } = createHarness();
    const report = await service.scan({}, 7);
    expect(report.counts.by_code.publication_mismatch).toBe(1);
    expect(report.repairs).toHaveLength(0);
    expect(dataSource.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO operation_logs'), expect.any(Array));
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('requires explicit confirmation and safely rebinds a mismatched publication', async () => {
    const { service, storage, dataSource } = createHarness();
    await expect(service.scan({ repair: true }, 7)).rejects.toMatchObject({ response: { code: 'RESOURCE_STORAGE_REPAIR_CONFIRM_REQUIRED' } });
    const report = await service.scan({ repair: true, confirm: true }, 7);
    expect(storage.createBinding).toHaveBeenCalledWith('object-1', expect.objectContaining({ owner_id: 'file-1', visibility: 'public' }));
    expect(dataSource.transaction).toHaveBeenCalled();
    expect(report.repairs).toEqual([expect.objectContaining({ status: 'repaired', action: 'rebound' })]);
  });

  it('marks a missing object unavailable without deleting provider data', async () => {
    const { service, dataSource } = createHarness();
    dataSource.query.mockReset();
    dataSource.query.mockImplementation((sql: string) => sql.includes('SELECT f.id') ? Promise.resolve([{
        id: 1, public_id: 'file-1', resource_version_id: 10, storage_backend: 'res', provider_object_id: 'missing', provider_binding_id: null,
        content_hash: sha256, size_bytes: 4, mime_type: 'application/octet-stream', integrity_status: 'verified', availability_status: 'available',
        resource_public_id: 'resource-1', resource_status: 'approved', resource_is_public: 1, resource_visibility: 'public', resource_deleted_at: null, version_status: 'published',
      }]) : Promise.resolve({ affectedRows: 1 }));
    const report = await service.scan({ repair: true, confirm: true }, 7);
    expect(report.counts.by_code.missing_object).toBe(1);
    expect(dataSource.query).toHaveBeenCalledWith(expect.stringContaining("availability_status='unavailable'"), [1]);
    expect(dataSource.query.mock.calls.some((call: unknown[]) => String(call[0]).includes('DELETE'))).toBe(false);
  });
});
