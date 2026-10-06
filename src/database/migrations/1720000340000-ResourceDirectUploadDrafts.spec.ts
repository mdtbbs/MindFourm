import { ResourceDirectUploadDrafts1720000340000 } from './1720000340000-ResourceDirectUploadDrafts';

describe('ResourceDirectUploadDrafts1720000340000', () => {
  it('adds only the durable draft table with unique idempotency/version constraints and a version FK', async () => {
    const queryRunner = {
      createTable: jest.fn().mockResolvedValue(undefined),
      createForeignKey: jest.fn().mockResolvedValue(undefined),
      dropTable: jest.fn().mockResolvedValue(undefined),
    };
    await new ResourceDirectUploadDrafts1720000340000().up(queryRunner as any);

    const table = queryRunner.createTable.mock.calls[0][0];
    expect(table.name).toBe('resource_direct_upload_drafts');
    expect(table.columns.map((column: any) => column.name)).toEqual([
      'id', 'resource_version_id', 'user_id', 'idempotency_key_hash', 'request_fingerprint', 'request_metadata',
      'status', 'expires_at', 'completed_at', 'created_at',
    ]);
    expect(table.uniques).toEqual(expect.arrayContaining([
      expect.objectContaining({ columnNames: ['resource_version_id'] }),
      expect.objectContaining({ columnNames: ['user_id', 'idempotency_key_hash'] }),
    ]));
    expect(queryRunner.createForeignKey).toHaveBeenCalledWith('resource_direct_upload_drafts', expect.objectContaining({
      referencedTableName: 'resource_versions', referencedColumnNames: ['id'], onDelete: 'CASCADE',
    }));
  });

  it('rolls back by dropping only the additive draft table', async () => {
    const queryRunner = {
      createTable: jest.fn(),
      createForeignKey: jest.fn(),
      dropTable: jest.fn().mockResolvedValue(undefined),
    };
    await new ResourceDirectUploadDrafts1720000340000().down(queryRunner as any);
    expect(queryRunner.dropTable).toHaveBeenCalledWith('resource_direct_upload_drafts', true);
    expect(queryRunner.query).toBeUndefined();
  });
});
