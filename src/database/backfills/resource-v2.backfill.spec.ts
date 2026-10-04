import { runResourceV2Backfill, BackfillMode } from './resource-v2.backfill';

describe('runResourceV2Backfill', () => {
  function createMockDataSource(options: {
    resources?: any[];
    existingVersions?: any[];
    existingAttributions?: any[];
    existingFiles?: any[];
    existingRows?: Record<string, any[]>;
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
        const idLookup = sql.match(/SELECT id FROM `([a-z_]+)`/i);
        if (idLookup) return options.existingRows?.[idLookup[1]] || [];

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
    const fileInsert = mockDataSource.query.mock.calls.find(
      (call: any[]) => typeof call[0] === 'string' && call[0].includes('INSERT INTO `resource_files`'),
    );
    // MFL is a provider-backed delivery, not an external link. Keeping the
    // URL in storage_key prevents a client from treating it as an unverified
    // third-party redirect.
    expect(fileInsert![1]).toContain('mfl');
    expect(fileInsert![1]).toContain('https://mfl.example.com/file/99');
    expect(fileInsert![1]).toContain(99);
    expect(fileInsert![1]).toContain(null);
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

  it('seeds the legacy author as owner and reports a missing author identity', async () => {
    const { mockDataSource } = createMockDataSource({
      resources: [
        { id: 20, user_id: 42, resource_type: 'external', external_url: 'https://example.test/a', version: '1.0' },
        { id: 21, user_id: null, resource_type: 'external', external_url: 'https://example.test/b', version: '1.0' },
      ],
    });

    const result = await runResourceV2Backfill(mockDataSource as any, 'write');

    expect(result.owner_members_created).toBe(1);
    expect(result.owner_warnings).toEqual([{ resource_id: 21, warning: 'missing_or_invalid_user_id' }]);
    expect(mockDataSource.query.mock.calls.some(([sql]) => String(sql).includes("VALUES (?, ?, 'owner', 'active', NOW(6))"))).toBe(true);
  });

  it('copies legacy map renderer and publisher metadata to its version without creating a Resource', async () => {
    const { mockDataSource } = createMockDataSource({
      resources: [{
        id: 30, user_id: 42, resource_type: 'upload', resource_kind: 'map', file_path: '/map.msav',
        version: '8.0', renderer_metadata_json: {
          width: 256, height: 128, planet: 'serpulo', game_modes: ['survival'], rules: { waveSpacing: 2 },
          resources: [{ name: 'copper', amount: 10 }], spawn_points: [{ x: 4, y: 6, team: 'sharded' }],
          cores: [{ x: 5, y: 7, team: 'sharded', type: 'core-shard' }],
          wave_groups: [{ wave_start: 1, wave_end: 5, enemy_count: 8, boss_count: 1 }],
          analysis: { estimated_difficulty: 2.5 },
        },
        metadata_json: { planets: ['serpulo'], game_modes: ['survival'] },
      }],
    });

    const result = await runResourceV2Backfill(mockDataSource as any, 'write');
    const calls = mockDataSource.query.mock.calls.map(([sql, params]) => [String(sql), params] as const);
    const metadataInsert = calls.find(([sql]) => sql.includes('INSERT IGNORE INTO map_version_metadata'));

    expect(result.structure).toMatchObject({
      map_metadata_created: 1, map_resources_created: 1, map_spawns_created: 1,
      map_cores_created: 1, map_waves_created: 1, map_analyses_created: 1,
    });
    expect(metadataInsert?.[1]).toContain(100);
    expect(metadataInsert?.[1]).toContain(JSON.stringify({ waveSpacing: 2 }));
    expect(calls.some(([sql]) => sql.includes('INSERT INTO `resources`'))).toBe(false);
  });

  it('copies schematic blocks, materials, compatibility and analysis to the existing release', async () => {
    const { mockDataSource } = createMockDataSource({
      resources: [{
        id: 31, user_id: 42, resource_type: 'upload', resource_kind: 'schematic', file_path: '/base64.msch',
        version: 'legacy-31', renderer_metadata_json: {
          width: 8, height: 6, blocks: 12, structure_hash: 'a'.repeat(64), schematic_format_version: 1,
          compatibility: { minimum_supported_build: 145 },
          block_types: [{ name: 'copper-wall', count: 12 }],
          block_positions: [{ name: 'copper-wall', x: 1, y: 2 }],
          requirements: [{ item: 'copper', amount: 120 }],
          logic_processors: [{ x: 3, y: 4, type: 'logic' }],
          production: { complete: false, available: true, estimated: true, outputs: [] },
        },
        metadata_json: { required_mods: ['example-mod'] },
      }],
    });

    const result = await runResourceV2Backfill(mockDataSource as any, 'write');

    expect(result.structure).toMatchObject({
      schematic_metadata_created: 1, schematic_blocks_created: 1, schematic_materials_created: 1,
      schematic_logic_processors_created: 1, schematic_analyses_created: 1,
    });
    const blockInsert = mockDataSource.query.mock.calls.find(([sql]) => String(sql).includes('INSERT IGNORE INTO schematic_blocks'));
    expect(blockInsert?.[1]).toEqual([100, 'copper-wall', null, 12, JSON.stringify([{ name: 'copper-wall', x: 1, y: 2 }]), null]);
  });

  it('dry-run reports existing owner and map metadata as skipped and does not write', async () => {
    const { mockDataSource } = createMockDataSource({
      resources: [{ id: 40, user_id: 42, resource_kind: 'map', resource_type: 'upload', version: '1.0', renderer_metadata_json: { width: 16 } }],
      existingVersions: [{ id: 10 }],
      existingRows: { resource_members: [{ id: 1 }], map_version_metadata: [{ id: 2 }] },
    });

    const result = await runResourceV2Backfill(mockDataSource as any, 'dry-run');

    expect(result.owner_members_skipped).toBe(1);
    expect(result.structure.map_metadata_skipped).toBe(1);
    expect(mockDataSource.query.mock.calls.some(([sql]) => String(sql).trim().startsWith('INSERT'))).toBe(false);
  });
});
