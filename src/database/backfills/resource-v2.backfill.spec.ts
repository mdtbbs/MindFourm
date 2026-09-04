import { runResourceV2Backfill, BackfillMode } from './resource-v2.backfill';

describe('runResourceV2Backfill', () => {
  function createMockDataSource(options: {
    resources?: any[];
    existingVersions?: any[];
    existingAttributions?: any[];
    existingFiles?: any[];
  }) {
    const queries: string[] = [];
    let insertIdCounter = 100;

    const mockDataSource = {
      query: jest.fn(async (sql: string, params?: any[]) => {
        queries.push(sql.trim().substring(0, 80));

        // Resource list query
        if (sql.includes('FROM `resources`') && sql.includes('ORDER BY')) {
          return options.resources || [];
        }

        // Check existing version
        if (sql.includes('FROM `resource_versions`') && sql.includes('is_legacy_root_release')) {
          return options.existingVersions || [];
        }

        // Check existing attribution
        if (sql.includes('FROM `resource_attributions`') && sql.includes("`role` = 'submitter'")) {
          return options.existingAttributions || [];
        }

        // Check existing file
        if (sql.includes('FROM `resource_files`') && sql.includes("`role` = 'primary'")) {
          return options.existingFiles || [];
        }

        // INSERT into versions
        if (sql.includes('INSERT INTO `resource_versions`')) {
          return { insertId: insertIdCounter++ };
        }

        // Other INSERTs and UPDATEs
        if (sql.startsWith('INSERT') || sql.startsWith('UPDATE')) {
          return { affected: 1 };
        }

        return [];
      }),
    };

    return { mockDataSource, queries };
  }

  it('creates structured records for a local upload resource in write mode', async () => {
    const { mockDataSource } = createMockDataSource({
      resources: [{
        id: 1,
        user_id: 42,
        description: 'A test resource',
        resource_type: 'upload',
        use_mfl: 0,
        file_path: '/uploads/test.jar',
        file_name: 'test.jar',
        mime_type: 'application/java-archive',
        file_size: 1024,
        version: '1.0',
        summary: null,
        latest_published_version_id: null,
      }],
    });

    const result = await runResourceV2Backfill(mockDataSource as any, 'write');

    expect(result.resources_scanned).toBe(1);
    expect(result.attributions_created).toBe(1);
    expect(result.versions_created).toBe(1);
    expect(result.files_created).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it('skips existing records on second run (idempotency)', async () => {
    const { mockDataSource } = createMockDataSource({
      resources: [{
        id: 1, user_id: 42, description: 'Test', resource_type: 'upload',
        use_mfl: 0, file_path: '/test.jar', version: '1.0',
        summary: 'Test', latest_published_version_id: 10,
      }],
      existingVersions: [{ id: 10 }],
      existingAttributions: [{ id: 1 }],
      existingFiles: [{ id: 1 }],
    });

    const result = await runResourceV2Backfill(mockDataSource as any, 'write');

    expect(result.resources_scanned).toBe(1);
    expect(result.attributions_skipped).toBe(1);
    expect(result.versions_skipped).toBe(1);
    expect(result.files_skipped).toBe(1);
    expect(result.attributions_created).toBe(0);
    expect(result.versions_created).toBe(0);
    expect(result.files_created).toBe(0);
  });

  it('dry-run mode does not write', async () => {
    const { mockDataSource } = createMockDataSource({
      resources: [{
        id: 1, user_id: 42, description: 'Test', resource_type: 'upload',
        use_mfl: 0, file_path: '/test.jar', version: '1.0',
        summary: null, latest_published_version_id: null,
      }],
    });

    const result = await runResourceV2Backfill(mockDataSource as any, 'dry-run');

    expect(result.resources_scanned).toBe(1);
    expect(result.versions_created).toBe(1);
    // Verify no INSERT queries were executed
    const insertQueries = mockDataSource.query.mock.calls.filter(
      (call: any[]) => typeof call[0] === 'string' && call[0].trim().startsWith('INSERT'),
    );
    expect(insertQueries).toHaveLength(0);
  });

  it('handles MFL resources', async () => {
    const { mockDataSource } = createMockDataSource({
      resources: [{
        id: 2, user_id: 42, description: 'MFL resource', resource_type: 'upload',
        use_mfl: 1, mfl_file_id: 99, mfl_download_url: 'https://mfl.example.com/file/99',
        version: '2.0', summary: null, latest_published_version_id: null,
      }],
    });

    const result = await runResourceV2Backfill(mockDataSource as any, 'write');

    expect(result.files_created).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it('handles external resources', async () => {
    const { mockDataSource } = createMockDataSource({
      resources: [{
        id: 3, user_id: 42, description: 'External', resource_type: 'external',
        use_mfl: 0, external_url: 'https://example.com/mod.jar',
        version: '1.0', summary: null, latest_published_version_id: null,
      }],
    });

    const result = await runResourceV2Backfill(mockDataSource as any, 'write');

    expect(result.files_created).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it('handles blank version with legacy-{id} fallback', async () => {
    const { mockDataSource } = createMockDataSource({
      resources: [{
        id: 5, user_id: 42, description: 'No version', resource_type: 'upload',
        use_mfl: 0, file_path: '/test.jar', version: '', summary: null,
        latest_published_version_id: null,
      }],
    });

    const result = await runResourceV2Backfill(mockDataSource as any, 'write');

    expect(result.versions_created).toBe(1);
    // The INSERT query should contain 'legacy-5'
    const versionInsert = mockDataSource.query.mock.calls.find(
      (call: any[]) => typeof call[0] === 'string' && call[0].includes('INSERT INTO `resource_versions`'),
    );
    expect(versionInsert).toBeDefined();
    expect(versionInsert![1]).toContain('legacy-5');
  });

  it('handles invalid external URL as unavailable', async () => {
    const { mockDataSource } = createMockDataSource({
      resources: [{
        id: 6, user_id: 42, description: 'Bad URL', resource_type: 'external',
        use_mfl: 0, external_url: 'not-a-url', version: '1.0',
        summary: null, latest_published_version_id: null,
      }],
    });

    const result = await runResourceV2Backfill(mockDataSource as any, 'write');

    expect(result.files_created).toBe(1);
    expect(result.errors).toHaveLength(0);
  });
});
