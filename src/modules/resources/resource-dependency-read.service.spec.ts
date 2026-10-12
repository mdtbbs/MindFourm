import { ResourceDependencyReadService } from './resource-dependency-read.service';

type QueryHandler = (sql: string, params?: unknown[]) => unknown[];

function createService(handler: QueryHandler) {
  const dataSource = { query: jest.fn(async (sql: string, params?: unknown[]) => handler(sql, params)) };
  const service = new ResourceDependencyReadService(dataSource as any);
  return { service, dataSource };
}

const TABLE_SQL = 'information_schema.tables';

/** Mock dataSource.query: table checks hit information_schema, everything else routed by table name. */
function mockDataSource(opts: {
  tables: string[];
  modernDependencies?: Record<string, unknown>[];
  legacyDependencies?: Record<string, unknown>[];
  modernCompatibilities?: Record<string, unknown>[];
  legacyCompatibilities?: Record<string, unknown>[];
  releaseChannels?: Array<[number, string | null]>;
  resources?: Record<string, unknown>[];
}) {
  return createService((sql: string, params?: unknown[]) => {
    if (sql.includes(TABLE_SQL)) {
      const table = (params?.[0] as string) || '';
      return opts.tables.includes(table) ? [{ present: 1 }] : [];
    }
    if (sql.includes('FROM resource_version_dependencies')) {
      const rows = opts.legacyDependencies || [];
      if (!sql.includes('NOT EXISTS')) return rows;
      // Emulate the NOT EXISTS legacy_source_id dedup guard.
      const copied = new Set((opts.modernDependencies || []).map((row) => row.legacy_source_id).filter(Boolean));
      return rows.filter((row) => !copied.has(row.id));
    }
    if (sql.includes('FROM resource_version_compatibilities')) {
      // Compatibility dedup happens in application code (content keys), so the
      // legacy SELECT returns every row; `resource_versions` supplies the
      // release channel used to recognise a double-written row.
      const releaseChannels = new Map<number, string | null>((opts.releaseChannels || []));
      return (opts.legacyCompatibilities || []).map((row) => ({
        ...row,
        version_release_channel: releaseChannels.get(Number(row.resource_version_id)) ?? null,
      }));
    }
    if (sql.includes('FROM resource_dependencies')) return opts.modernDependencies || [];
    if (sql.includes('FROM resource_compatibilities')) return opts.modernCompatibilities || [];
    return [];
  });
}

describe('ResourceDependencyReadService unified projection', () => {
  it('returns empty maps for empty input', async () => {
    const { service, dataSource } = createService(() => []);
    await expect(service.collectDependencies([])).resolves.toEqual(new Map());
    await expect(service.collectCompatibilities([])).resolves.toEqual(new Map());
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('modern-only: reads modern tables and never touches legacy rows', async () => {
    const { service, dataSource } = mockDataSource({
      tables: ['resource_dependencies', 'resource_compatibilities'],
      modernDependencies: [{
        id: 5, resource_version_id: 10, dependency_type: 'optional', target_resource_id: 3,
        target_public_id: 'modern-target', external_identifier: null, upstream_url: 'https://example.test/mod',
        version_constraint: '^2.0', resolution_status: 'resolved', notes: 'modern note', sort_order: 1,
      }],
      modernCompatibilities: [{
        id: 7, resource_version_id: 10, runtime: 'mindustry', game_version: 'v8',
        min_game_version: '146', max_game_version: null, channel: 'stable', platform_key: 'desktop',
        status: 'compatible', source: 'analyzer', confidence: 'high', notes: null,
      }],
    });

    const deps = await service.collectDependencies([10]);
    const dep = deps.get(10)![0];
    expect(dep).toMatchObject({
      dependency_type: 'optional', target_public_id: 'modern-target',
      upstream_url: 'https://example.test/mod', version_constraint: '^2.0',
      resolution_status: 'resolved', notes: 'modern note', source: 'modern',
    });

    const compats = await service.collectCompatibilities([10]);
    expect(compats.get(10)![0]).toMatchObject({
      runtime: 'mindustry', game_version: 'v8', min_version: '146',
      platform_key: 'desktop', status: 'compatible', source: 'analyzer', confidence: 'high', origin: 'modern',
    });
    // Legacy tables absent → never queried.
    expect(dataSource.query.mock.calls.some(([sql]) => String(sql).includes('resource_version_dependencies'))).toBe(false);
    expect(dataSource.query.mock.calls.some(([sql]) => String(sql).includes('FROM resource_version_compatibilities'))).toBe(false);
  });

  it('legacy-only: falls back to legacy tables with normalized fields', async () => {
    const { service } = mockDataSource({
      tables: ['resource_version_dependencies', 'resource_version_compatibilities'],
      legacyDependencies: [{
        id: 11, resource_version_id: 20, dependency_type: 'required', target_resource_id: 4,
        target_public_id: null, external_identifier: 'legacy-ext', version_constraint: '>=1.0',
        notes: null, sort_order: 0,
      }],
      legacyCompatibilities: [{
        id: 12, resource_version_id: 20, runtime: 'mindustry', game_series: 'v7',
        min_version_value: '136', max_version_value: '146', channel: null, platform_key: null,
        provenance: 'user_declared', confidence: null, notes: 'legacy note',
      }],
    });

    const deps = await service.collectDependencies([20]);
    expect(deps.get(20)![0]).toMatchObject({
      dependency_type: 'required', target_public_id: null, external_identifier: 'legacy-ext',
      version_constraint: '>=1.0', upstream_url: null, resolution_status: null, source: 'legacy',
    });

    const compats = await service.collectCompatibilities([20]);
    expect(compats.get(20)![0]).toMatchObject({
      game_version: 'v7', min_version: '136', max_version: '146',
      source: 'user_declared', notes: 'legacy note', origin: 'legacy',
    });
  });

  it('mixed: merges uncopied legacy rows and deduplicates copied ones by legacy_source_id', async () => {
    const { service, dataSource } = mockDataSource({
      tables: ['resource_dependencies', 'resource_version_dependencies', 'resource_compatibilities', 'resource_version_compatibilities'],
      modernDependencies: [
        // Copied from legacy id 11 (already migrated) — legacy row must be skipped.
        { id: 100, legacy_source_id: 11, resource_version_id: 30, dependency_type: 'required', target_resource_id: 4, target_public_id: 'target-four', external_identifier: null, upstream_url: null, version_constraint: '>=1.0', resolution_status: 'resolved', notes: null, sort_order: 0 },
        // Modern-native row.
        { id: 101, legacy_source_id: null, resource_version_id: 30, dependency_type: 'embedded', target_resource_id: null, target_public_id: null, external_identifier: 'bundled-mod', upstream_url: null, version_constraint: null, resolution_status: 'unresolved', notes: 'bundled', sort_order: 2 },
      ],
      legacyDependencies: [
        // Already copied → excluded by NOT EXISTS in SQL; handler emulates the filter.
        // Uncopied legacy row survives.
        { id: 13, resource_version_id: 30, dependency_type: 'incompatible', target_resource_id: 9, target_public_id: null, external_identifier: 'old-rival', version_constraint: null, notes: 'conflict', sort_order: 1 },
      ],
      modernCompatibilities: [
        { id: 200, legacy_source_id: 12, resource_version_id: 30, runtime: 'mindustry', game_version: null, min_game_version: '136', max_game_version: '146', channel: null, platform_key: null, status: null, source: 'author', confidence: null, notes: null },
      ],
      legacyCompatibilities: [
        { id: 14, resource_version_id: 30, runtime: 'mindustry', game_series: 'v8', min_version_value: '147', max_version_value: null, channel: 'beta', platform_key: 'android', provenance: 'verified', confidence: 'medium', notes: null },
      ],
    });

    const deps = await service.collectDependencies([30]);
    const rows = deps.get(30)!;
    // Sorted by sort_order: modern required (0), legacy incompatible (1), modern embedded (2).
    expect(rows.map((row) => [row.dependency_type, row.source])).toEqual([
      ['required', 'modern'], ['incompatible', 'legacy'], ['embedded', 'modern'],
    ]);
    expect(rows).toHaveLength(3); // copied legacy row deduplicated
    expect(rows[2]).toMatchObject({ external_identifier: 'bundled-mod', notes: 'bundled' });

    const compats = await service.collectCompatibilities([30]);
    const compatRows = compats.get(30)!;
    expect(compatRows.map((row) => row.origin).sort()).toEqual(['legacy', 'modern']);
    expect(compatRows.find((row) => row.origin === 'legacy')).toMatchObject({ game_version: 'v8', min_version: '147', source: 'verified' });

    // The legacy SELECTs must carry the NOT EXISTS legacy_source_id guard.
    const legacyDepSql = String(dataSource.query.mock.calls.find(([sql]) => String(sql).includes('FROM resource_version_dependencies d'))?.[0]);
    expect(legacyDepSql).toContain('NOT EXISTS');
    expect(legacyDepSql).toContain('legacy_source_id');
  });

  describe('compatibility double-write dedup (app-written, legacy_source_id NULL)', () => {
    it('emits one row when the same constraint was written to both tables', async () => {
      const { service } = mockDataSource({
        tables: ['resource_compatibilities', 'resource_version_compatibilities'],
        releaseChannels: [[60, 'release']],
        modernCompatibilities: [{
          id: 300, resource_version_id: 60, runtime: 'mindustry', game_version: null,
          min_game_version: '146', max_game_version: null, channel: 'release', platform_key: null,
          status: 'declared', source: 'author', confidence: null, notes: null, legacy_source_id: null,
        }],
        legacyCompatibilities: [{
          id: 61, resource_version_id: 60, runtime: 'mindustry', game_series: null,
          min_version_value: '146', max_version_value: null, channel: null, platform_key: null,
          provenance: 'user_declared', confidence: null, notes: null,
        }],
      });

      const rows = (await service.collectCompatibilities([60])).get(60)!;

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ min_version: '146', origin: 'modern' });
    });

    it('keeps genuinely different constraints from the same version', async () => {
      const { service } = mockDataSource({
        tables: ['resource_compatibilities', 'resource_version_compatibilities'],
        releaseChannels: [[61, 'release']],
        modernCompatibilities: [{
          id: 301, resource_version_id: 61, runtime: 'mindustry', game_version: null,
          min_game_version: '147', max_game_version: null, channel: 'release', platform_key: null,
          status: 'declared', source: 'author', confidence: null, notes: null, legacy_source_id: null,
        }],
        legacyCompatibilities: [
          // Different min_version → its own constraint, must survive.
          { id: 62, resource_version_id: 61, runtime: 'mindustry', game_series: null, min_version_value: '146', max_version_value: null, channel: null, platform_key: null, provenance: 'user_declared', confidence: null, notes: null },
          // Explicit channel → distinct from the release-channel row above.
          { id: 63, resource_version_id: 61, runtime: 'mindustry', game_series: null, min_version_value: '147', max_version_value: null, channel: 'beta', platform_key: null, provenance: 'user_declared', confidence: null, notes: null },
        ],
      });

      const rows = (await service.collectCompatibilities([61])).get(61)!;

      expect(rows.filter((row) => row.origin === 'modern')).toHaveLength(1);
      expect(rows.filter((row) => row.origin === 'legacy').map((row) => [row.min_version, row.channel]))
        .toEqual([['146', null], ['147', 'beta']]);
    });

    it('does not treat a NULL-channel legacy row as a copy when the modern row uses another channel', async () => {
      const { service } = mockDataSource({
        tables: ['resource_compatibilities', 'resource_version_compatibilities'],
        releaseChannels: [[62, 'beta']],
        modernCompatibilities: [{
          id: 302, resource_version_id: 62, runtime: 'mindustry', game_version: null,
          min_game_version: '146', max_game_version: null, channel: 'release', platform_key: null,
          status: 'declared', source: 'author', confidence: null, notes: null, legacy_source_id: null,
        }],
        legacyCompatibilities: [{
          id: 64, resource_version_id: 62, runtime: 'mindustry', game_series: null,
          min_version_value: '146', max_version_value: null, channel: null, platform_key: null,
          provenance: 'user_declared', confidence: null, notes: null,
        }],
      });

      const rows = (await service.collectCompatibilities([62])).get(62)!;

      // The release channel on the version is 'beta', not the modern row's
      // 'release', so the legacy row is a distinct constraint.
      expect(rows.map((row) => [row.channel, row.origin])).toEqual([['release', 'modern'], [null, 'legacy']]);
    });

    it('modern mirror wins over the legacy row it was written from', async () => {
      const { service } = mockDataSource({
        tables: ['resource_compatibilities', 'resource_version_compatibilities'],
        releaseChannels: [[63, 'release']],
        modernCompatibilities: [{
          id: 303, legacy_source_id: 65, resource_version_id: 63, runtime: 'mindustry', game_version: 'v8',
          min_game_version: '147', max_game_version: '148', channel: 'stable', platform_key: 'desktop',
          status: 'compatible', source: 'analyzer', confidence: 'high', notes: 'mirrored',
        }],
        legacyCompatibilities: [{
          id: 65, resource_version_id: 63, runtime: 'mindustry', game_series: 'v8',
          min_version_value: '147', max_version_value: '148', channel: 'stable', platform_key: 'desktop',
          provenance: 'inferred', confidence: 'high', notes: 'mirrored',
        }],
      });

      const rows = (await service.collectCompatibilities([63])).get(63)!;

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ origin: 'modern', source: 'analyzer', status: 'compatible' });
    });

    it('does not deduplicate dependency rows by content (no app double-write on the dependency side)', async () => {
      const { service } = mockDataSource({
        tables: ['resource_dependencies', 'resource_version_dependencies'],
        modernDependencies: [{
          id: 400, legacy_source_id: null, resource_version_id: 64, dependency_type: 'required',
          target_resource_id: 5, target_public_id: 'target-five', external_identifier: null,
          upstream_url: null, version_constraint: '^1.0', resolution_status: 'resolved', notes: null, sort_order: 0,
        }],
        legacyDependencies: [{
          id: 66, resource_version_id: 64, dependency_type: 'required', target_resource_id: 5,
          target_public_id: 'target-five', external_identifier: null, version_constraint: '^1.0',
          notes: null, sort_order: 0,
        }],
      });

      const rows = (await service.collectDependencies([64])).get(64)!;

      // Legacy dedup still relies on legacy_source_id only; an app-written
      // legacy twin without that key is intentionally left alone.
      expect(rows).toHaveLength(2);
    });
  });

  it('resolves unlisted dependency targets and suppresses private ones', async () => {
    const { service, dataSource } = mockDataSource({
      tables: ['resource_dependencies'],
      modernDependencies: [
        { id: 1, resource_version_id: 70, dependency_type: 'required', target_resource_id: 8, target_public_id: 'unlisted-target', external_identifier: null, upstream_url: null, version_constraint: null, resolution_status: 'resolved', notes: null, sort_order: 0 },
        { id: 2, resource_version_id: 70, dependency_type: 'optional', target_resource_id: 9, target_public_id: null, external_identifier: null, upstream_url: null, version_constraint: null, resolution_status: 'resolved', notes: null, sort_order: 1 },
      ],
    });

    const deps = await service.collectDependencies([70]);

    expect(deps.get(70)!.map((row) => row.target_public_id)).toEqual(['unlisted-target', null]);
    // Only `private` is unreachable, so the visibility predicate must not filter on 'public'.
    const sql = String(dataSource.query.mock.calls.find(([statement]) => String(statement).includes('FROM resource_dependencies d'))?.[0]);
    expect(sql).toContain("visibility <> 'private'");
    expect(sql).not.toContain("visibility = 'public'");
  });

  it('joins active categories only for the Pack manifest projection', async () => {
    const { service, dataSource } = mockDataSource({
      tables: ['resource_dependencies'],
      modernDependencies: [{
        id: 1, resource_version_id: 71, dependency_type: 'required', target_resource_id: 8,
        target_public_id: 'pack-target', external_identifier: null, upstream_url: null,
        version_constraint: null, resolution_status: 'resolved', notes: null, sort_order: 0,
      }],
    });

    await service.collectDependencies([71]);
    await service.collectDependencies([71], { requireActiveTargetCategory: true });

    const calls = dataSource.query.mock.calls.map(([sql]) => String(sql)).filter((sql) => sql.includes('FROM resource_dependencies d'));
    expect(calls[0]).not.toContain('resource_categories');
    expect(calls[1]).toContain('resource_categories');
    expect(calls[1]).toContain("target_category.is_active = 1");
  });

  it('suppresses target public_id for private, deleted or unpublished targets', async () => {
    const { service } = mockDataSource({
      tables: ['resource_dependencies'],
      modernDependencies: [
        { id: 1, resource_version_id: 40, dependency_type: 'required', target_resource_id: 8, target_public_id: null, external_identifier: null, upstream_url: null, version_constraint: null, resolution_status: 'resolved', notes: null, sort_order: 0 },
      ],
    });
    const deps = await service.collectDependencies([40]);
    expect(deps.get(40)![0].target_public_id).toBeNull();
    expect(deps.get(40)![0].target_resource_id).toBe(8); // identifier kept for internal use
  });

  it('keeps dependency kind whitelist and defaults unknown kinds to required', async () => {
    const { service } = mockDataSource({
      tables: ['resource_dependencies'],
      modernDependencies: [
        { id: 1, resource_version_id: 50, dependency_type: 'bogus-kind', target_resource_id: null, target_public_id: null, external_identifier: 'x', upstream_url: null, version_constraint: null, resolution_status: null, notes: null, sort_order: 0 },
      ],
    });
    const deps = await service.collectDependencies([50]);
    expect(deps.get(50)![0].dependency_type).toBe('required');
  });
});
