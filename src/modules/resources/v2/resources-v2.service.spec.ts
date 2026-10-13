import { DataSource } from 'typeorm';
import { Resource } from '@entities/resource.entity';
import { ResourceDependencyReadService } from '../resource-dependency-read.service';
import { ResourcesV2Service } from './resources-v2.service';

/**
 * Builds ResourcesV2Service around a real ResourceDependencyReadService backed
 * by a mocked DataSource, so these specs exercise the shared modern-first
 * projection through the V2 entry points instead of stubbing it away.
 */
function createServiceWithSharedRead(
  dependencyRead: ResourceDependencyReadService,
  overrides: { previews?: any; write?: any } = {},
) {
  return new ResourcesV2Service(
    {} as DataSource,
    {} as any,
    overrides.previews || ({} as any),
    dependencyRead,
    overrides.write,
  );
}

function dependencyReadFromRows(opts: {
  tables: string[];
  modernDependencies?: Record<string, unknown>[];
  legacyDependencies?: Record<string, unknown>[];
}) {
  const dataSource = {
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('information_schema.tables')) {
        return opts.tables.includes(String(params?.[0])) ? [{ present: 1 }] : [];
      }
      if (sql.includes('FROM resource_version_dependencies')) {
        const legacy = opts.legacyDependencies || [];
        if (!sql.includes('NOT EXISTS')) return legacy;
        const copied = new Set((opts.modernDependencies || []).map(row => row.legacy_source_id).filter(Boolean));
        return legacy.filter(row => !copied.has(row.id));
      }
      if (sql.includes('FROM resource_dependencies')) return opts.modernDependencies || [];
      return [];
    }),
  };
  return { service: new ResourceDependencyReadService(dataSource as any), dataSource };
}

describe('ResourcesV2Service relation projection', () => {
  it('does not advertise a Resource preview before any binary version is published', () => {
    const service = new ResourcesV2Service({} as DataSource, {} as any, {} as any, {} as any);
    const resource = {
      id: 7, public_id: '4ab5d671-8af6-4d16-8238-7b6fd4b0a240', resource_kind: 'map',
      status: 'approved', is_public: 1, latest_published_version_id: null,
      file_path: '/uploads/.quarantine/resources/initial.msav',
      renderer_status: 'ready', renderer_preview_key: `resources/map/aa/${'a'.repeat(64)}/preview.png`,
    } as Resource;

    expect((service as any).resourcePreviewUrl(resource)).toBeNull();
  });

  it('preserves the recommended_for context and defaults unknown contexts to general', async () => {
    const service = new ResourcesV2Service({} as DataSource, {} as any, {} as any, {} as any);
    const resource = { id: 7 } as Resource;
    const contexts = ['opening', 'production', 'defense', 'logistics', 'general', 'unexpected'];
    jest.spyOn(service as any, 'rowsFrom').mockResolvedValue(contexts.map((relation_context, index) => ({
      id: index + 1,
      relation_type: 'recommended_for',
      relation_direction: index === 0 ? 'outgoing' : 'incoming',
      relation_context,
      created_at: new Date('2026-10-05T00:00:00.000Z'),
      peer_public_id: '4ab5d671-8af6-4d16-8238-7b6fd4b0a240',
      peer_title: 'Example map',
      peer_kind: 'map',
      peer_version_public_id: null,
      peer_version: null,
    })));

    const result = await (service as any).relationPage(resource, { limit: 20 });

    expect(result.items.map((item: any) => item.relation_context)).toEqual([
      'opening', 'production', 'defense', 'logistics', 'general', 'general',
    ]);
    expect(result.items.every((item: any) => item.relation_type === 'recommended_for')).toBe(true);
    expect(result.items.map((item: any) => item.relation_direction)).toEqual([
      'outgoing', 'incoming', 'incoming', 'incoming', 'incoming', 'incoming',
    ]);
    expect(result.items.every((item: any) => item.version === null)).toBe(true);
  });

  it('returns a published peer version label alongside its public UUID', async () => {
    const service = new ResourcesV2Service({} as DataSource, {} as any, {} as any, {} as any);
    jest.spyOn(service as any, 'rowsFrom').mockResolvedValue([{
      id: 1, relation_type: 'fork_of', relation_direction: 'outgoing', relation_context: 'general',
      created_at: new Date('2026-10-05T00:00:00.000Z'), peer_public_id: '4ab5d671-8af6-4d16-8238-7b6fd4b0a240',
      peer_title: 'Upstream Mod', peer_kind: 'mod', peer_version_public_id: '84b37577-d086-4897-a866-658e29e0bd09',
      peer_version: '2.1.0',
    }]);

    const result = await (service as any).relationPage({ id: 7 } as Resource, { limit: 20 });

    expect(result.items[0].version_public_id).toBe('84b37577-d086-4897-a866-658e29e0bd09');
    expect(result.items[0].version).toBe('2.1.0');
  });
});

describe('ResourcesV2Service reviewer workbench access', () => {
  it('lets moderators inspect pending releases on private Resources without granting edit permissions', async () => {
    const service = new ResourcesV2Service({} as DataSource, {} as any, {} as any, {} as any);
    const resource = {
      id: 7, public_id: '4ab5d671-8af6-4d16-8238-7b6fd4b0a240', is_public: 0,
      status: 'pending', renderer: null,
    } as unknown as Resource;
    jest.spyOn(service as any, 'findResourceByPublicId').mockResolvedValue(resource);
    jest.spyOn(service as any, 'memberRole').mockResolvedValue(null);
    jest.spyOn(service as any, 'toPublicResourceDto').mockResolvedValue({});
    const listVersions = jest.spyOn(service as any, 'listVersionRows').mockResolvedValue({ items: [{ id: 22, status: 'pending_review' }] });
    jest.spyOn(service as any, 'hydrateVersions').mockResolvedValue([{ public_id: '84b37577-d086-4897-a866-658e29e0bd09', status: 'pending_review' }]);
    jest.spyOn(service as any, 'selectedVersion').mockResolvedValue(null);
    jest.spyOn(service as any, 'statsFor').mockResolvedValue({});

    const result = await service.getWorkbench(resource.public_id, { id: 30, role: 'moderator' });

    expect(listVersions).toHaveBeenCalledWith(resource, { limit: 100 }, true);
    expect(result.versions).toMatchObject([{ status: 'pending_review' }]);
    expect(result.permissions).toEqual({ role: 'moderator', can_manage: false });
  });
});

describe('ResourcesV2Service dependency resolution', () => {
  it('resolves public catalog releases, retains unresolved upstream dependencies, and returns a bounded tree', async () => {
    const service = new ResourcesV2Service({} as DataSource, {} as any, {} as any, {} as any);
    const root = { id: 7, resource_kind: 'mod', title: 'Root', is_public: 1, status: 'published' } as Resource;
    jest.spyOn(service as any, 'getPublicResource').mockResolvedValue({ entity: root });
    jest.spyOn(service as any, 'selectedVersion').mockResolvedValue({ id: 70, version: '1.0.0' });
    jest.spyOn(service as any, 'rowsFrom').mockResolvedValue([{ mod_id: 'root.mod' }]);
    jest.spyOn(service as any, 'tableExists').mockResolvedValue(true);
    jest.spyOn(service as any, 'loadModDependencies').mockImplementation(async (versionIds: number[]) => new Map(
      versionIds.map(versionId => [versionId, versionId === 70
        ? [{ mod_id: 'library.mod', kind: 'required', version_constraint: '>=1.0 <2.0', upstream_url: null }]
        : [{ mod_id: 'outside.catalog', kind: 'optional', version_constraint: null, upstream_url: 'https://example.org/mod' }]]),
    ));
    jest.spyOn(service as any, 'findPublicModsByIdentifiers').mockResolvedValue([{
      resource_id: 8, public_id: '4ab5d671-8af6-4d16-8238-7b6fd4b0a240', title: 'Library', mod_id: 'library.mod', requested_identifier: 'library.mod',
    }]);
    jest.spyOn(service as any, 'latestPublicModVersions').mockResolvedValue([{ resource_id: 8, id: 80, version: '1.4.0', public_id: '84b37577-d086-4897-a866-658e29e0bd09' }]);

    const result = await service.resolveDependencies('4ab5d671-8af6-4d16-8238-7b6fd4b0a240', {});

    expect(result.root_mod_id).toBe('root.mod');
    expect(result.direct).toMatchObject([{ mod_id: 'library.mod', status: 'resolved', version: '1.4.0' }]);
    expect(result.tree[0].children).toMatchObject([{ mod_id: 'outside.catalog', status: 'unresolved' }]);
    expect(result.unresolved).toMatchObject([{ mod_id: 'outside.catalog', upstream_url: 'https://example.org/mod' }]);
    expect((service as any).findPublicModsByIdentifiers).toHaveBeenCalledWith(['library.mod']);
  });
});

describe('ResourcesV2Service community reads', () => {
  it('returns paginated public issue fields without numeric database identifiers or attachment metadata', async () => {
    const service = new ResourcesV2Service({} as DataSource, {} as any, {} as any, {} as any);
    jest.spyOn(service as any, 'getPublicResource').mockResolvedValue({ entity: { id: 7, resource_kind: 'mod' } });
    jest.spyOn(service as any, 'rowsFrom').mockResolvedValue([{
      id: 120, public_id: '4ab5d671-8af6-4d16-8238-7b6fd4b0a240', version_public_id: '84b37577-d086-4897-a866-658e29e0bd09',
      fixed_version_public_id: null, status: 'open', title: 'Startup crash', body: 'Crashes on launch.',
      author_response_status: null, author_response: null, v2_sort_at: new Date('2026-10-05T00:00:00.000Z'), attachment_json: [{ name: 'private-log.txt' }],
    }]);

    const result = await service.getIssueReports('4ab5d671-8af6-4d16-8238-7b6fd4b0a240', { limit: 20 });

    expect(result.items).toEqual([expect.objectContaining({
      public_id: '4ab5d671-8af6-4d16-8238-7b6fd4b0a240',
      version_public_id: '84b37577-d086-4897-a866-658e29e0bd09',
      status: 'open', title: 'Startup crash',
    })]);
    expect(JSON.stringify(result)).not.toContain('120');
    expect(JSON.stringify(result)).not.toContain('private-log.txt');
    expect(result.items[0]).not.toHaveProperty('attachment_json');
  });
});

describe('ResourcesV2Service map analysis projection', () => {
  it('includes bounded structured wave summaries for the workbench wave viewer', async () => {
    const service = new ResourcesV2Service({} as DataSource, {} as any, {} as any, {} as any);
    jest.spyOn(service as any, 'rowsFrom').mockImplementation(async (_table: string, sql: string) => {
      if (sql.includes('FROM map_analyses')) return [{
        difficulty_confidence: 'low', estimated_difficulty: 38,
        resource_balance_json: { estimated: true }, path_analysis_json: { status: 'partial' }, warnings_json: [],
      }];
      if (sql.includes('FROM map_wave_summaries')) return [{
        wave_start: 8, wave_end: 12, enemy_count: 42, estimated_health: 2400,
        air_ratio: 0.25, boss_count: 1, strength: 42, is_spike: 1,
      }];
      return [];
    });

    const result = await (service as any).analysisData(70, 'map');

    expect(result.waves).toEqual([{
      wave_start: 8, wave_end: 12, enemy_count: 42, estimated_health: 2400,
      air_ratio: 0.25, boss_count: 1, strength: 42, is_spike: true,
    }]);
    expect(result.estimated).toBe(true);
  });

  it('returns wave rows when a map analysis summary is not available', async () => {
    const service = new ResourcesV2Service({} as DataSource, {} as any, {} as any, {} as any);
    jest.spyOn(service as any, 'rowsFrom').mockImplementation(async (_table: string, sql: string) => sql.includes('FROM map_wave_summaries')
      ? [{ wave_start: 2, wave_end: 2, enemy_count: null, estimated_health: null, air_ratio: null, boss_count: 0, strength: null, is_spike: 0 }]
      : []);

    const result = await (service as any).analysisData(70, 'map');

    expect(result).toMatchObject({ difficulty_confidence: 'estimated', waves: [{ wave_start: 2, wave_end: 2 }] });
    expect(result.estimated_difficulty).toBeNull();
  });
});


describe('ResourcesV2Service mod dependency reads (shared projection)', () => {
  const PUBLIC_VERSION = { id: 70, public_id: '84b37577-d086-4897-a866-658e29e0bd09', version: '1.0.0', status: 'published' };
  const ROOT_UUID = '4ab5d671-8af6-4d16-8238-7b6fd4b0a240';

  function modernRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 1, resource_version_id: 70, dependency_type: 'required', target_resource_id: 8,
      target_public_id: '9b1f5c2a-7d3e-4a61-8f0b-2c6d5e8a1b47', legacy_source_id: null, external_identifier: null,
      upstream_url: null, version_constraint: '>=1.0', resolution_status: 'resolved', notes: null, sort_order: 0,
      ...overrides,
    };
  }

  function legacyRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 11, resource_version_id: 70, dependency_type: 'optional', target_resource_id: null,
      target_public_id: null, external_identifier: 'mirrored.mod', upstream_url: null,
      version_constraint: null, notes: 'legacy note', sort_order: 1,
      ...overrides,
    };
  }

  function seedPublicMod(service: ResourcesV2Service) {
    jest.spyOn(service as any, 'getPublicResource').mockResolvedValue({ entity: { id: 7, resource_kind: 'mod', title: 'Root', is_public: 1, status: 'published' } });
    jest.spyOn(service as any, 'selectedVersion').mockResolvedValue(PUBLIC_VERSION);
  }

  it('modern-only: getDependencies reads the modern table and keeps ordering/kind/constraint semantics', async () => {
    const { service: shared } = dependencyReadFromRows({
      tables: ['resource_dependencies'],
      modernDependencies: [
        modernRow({ id: 3, sort_order: 2, dependency_type: 'optional', version_constraint: '^2.0', resolution_status: 'unresolved', upstream_url: 'https://example.test/a', notes: 'second' }),
        modernRow({ id: 1, sort_order: 1, dependency_type: 'required', version_constraint: '>=1.0', notes: 'first' }),
      ],
    });
    const service = createServiceWithSharedRead(shared);
    seedPublicMod(service);

    const page = await service.getDependencies(ROOT_UUID, 'mod', { limit: 20 });

    expect(page.items.map((item: any) => item.sort_order)).toEqual([1, 2]);
    expect(page.items.map((item: any) => item.dependency_type)).toEqual(['required', 'optional']);
    expect(page.items[1]).toMatchObject({ version_constraint: '^2.0', resolution_status: 'unresolved', upstream_url: 'https://example.test/a' });
    expect(page.items[1]).not.toHaveProperty('notes');
    expect(page.pagination.has_more).toBe(false);
  });

  it('legacy-only: getDependencies still returns rows when only the legacy table exists', async () => {
    const { service: shared } = dependencyReadFromRows({
      tables: ['resource_version_dependencies'],
      legacyDependencies: [legacyRow({ dependency_type: 'embedded', external_identifier: 'legacy.only', sort_order: 0 })],
    });
    const service = createServiceWithSharedRead(shared);
    seedPublicMod(service);

    const page = await service.getDependencies(ROOT_UUID, 'mod', { limit: 20 });

    expect(page.items).toMatchObject([{ dependency_type: 'embedded', external_identifier: 'legacy.only', resource_public_id: null }]);
  });

  it('mixed: a migration-mirrored legacy row is not duplicated by getDependencies', async () => {
    const { service: shared } = dependencyReadFromRows({
      tables: ['resource_dependencies', 'resource_version_dependencies'],
      modernDependencies: [modernRow({ id: 5, legacy_source_id: 11, external_identifier: 'mirrored.mod', dependency_type: 'optional', sort_order: 1 })],
      legacyDependencies: [legacyRow({ id: 11, external_identifier: 'mirrored.mod', dependency_type: 'optional', sort_order: 1 })],
    });
    const service = createServiceWithSharedRead(shared);
    seedPublicMod(service);

    const page = await service.getDependencies(ROOT_UUID, 'mod', { limit: 20 });

    expect(page.items).toHaveLength(1);
    expect(page.items[0].external_identifier).toBe('mirrored.mod');
  });

  it('mixed: an unmirrored legacy row survives alongside a distinct modern row', async () => {
    const { service: shared } = dependencyReadFromRows({
      tables: ['resource_dependencies', 'resource_version_dependencies'],
      modernDependencies: [modernRow({ id: 5, legacy_source_id: null, target_resource_id: 8, target_public_id: '9b1f5c2a-7d3e-4a61-8f0b-2c6d5e8a1b47', sort_order: 0 })],
      legacyDependencies: [legacyRow({ id: 12, external_identifier: 'legacy.extra', sort_order: 1 })],
    });
    const service = createServiceWithSharedRead(shared);
    seedPublicMod(service);

    const page = await service.getDependencies(ROOT_UUID, 'mod', { limit: 20 });

    expect(page.items.map((item: any) => item.resource_public_id ?? item.external_identifier)).toEqual(['9b1f5c2a-7d3e-4a61-8f0b-2c6d5e8a1b47', 'legacy.extra']);
  });

  it('does not emit a target public_id that the shared projection suppressed (private/deleted/unpublished/merged/unknown)', async () => {
    const { service: shared } = dependencyReadFromRows({
      tables: ['resource_dependencies'],
      // The projection itself nulls target_public_id for every non-visible or
      // unknown target state; the V2 mapper must not resurrect the raw id.
      modernDependencies: [
        modernRow({ id: 1, target_resource_id: 8, target_public_id: null, external_identifier: null, sort_order: 0 }),
        modernRow({ id: 2, target_resource_id: 9, target_public_id: null, external_identifier: 'declared.string', sort_order: 1 }),
      ],
    });
    const service = createServiceWithSharedRead(shared);
    seedPublicMod(service);

    const page = await service.getDependencies(ROOT_UUID, 'mod', { limit: 20 });

    expect(page.items.every((item: any) => item.resource_public_id === null)).toBe(true);
    expect(JSON.stringify(page)).not.toContain('9b1f5c2a-7d3e-4a61-8f0b-2c6d5e8a1b47');
  });

  it('paginates repeated sort_order values with an opaque composite cursor', async () => {
    const { service: shared } = dependencyReadFromRows({
      tables: ['resource_dependencies'],
      modernDependencies: [
        modernRow({ id: 1, sort_order: 0, external_identifier: 'a.mod' }),
        modernRow({ id: 2, sort_order: 0, external_identifier: 'b.mod' }),
        modernRow({ id: 3, sort_order: 1, external_identifier: 'c.mod' }),
      ],
    });
    const service = createServiceWithSharedRead(shared);
    seedPublicMod(service);

    const first = await service.getDependencies(ROOT_UUID, 'mod', { limit: 1 });
    expect(first.items.map((item: any) => item.external_identifier)).toEqual(['a.mod']);
    expect(first.pagination.has_more).toBe(true);
    expect(typeof first.pagination.next_cursor).toBe('string');

    const second = await service.getDependencies(ROOT_UUID, 'mod', { limit: 1, cursor: first.pagination.next_cursor as string });
    expect(second.items.map((item: any) => item.external_identifier)).toEqual(['b.mod']);
    expect(second.pagination.has_more).toBe(true);

    const third = await service.getDependencies(ROOT_UUID, 'mod', { limit: 1, cursor: second.pagination.next_cursor as string });
    expect(third.items.map((item: any) => item.external_identifier)).toEqual(['c.mod']);
    expect(third.pagination.has_more).toBe(false);
  });

  it('rejects a legacy timestamp cursor instead of silently returning an empty page', async () => {
    const { service: shared } = dependencyReadFromRows({ tables: ['resource_dependencies'], modernDependencies: [modernRow()] });
    const service = createServiceWithSharedRead(shared);
    seedPublicMod(service);
    const legacyCursor = Buffer.from(JSON.stringify({ sort_at: '2026-10-12T10:00:00.000Z', id: 1 }), 'utf8').toString('base64url');

    await expect(service.getDependencies(ROOT_UUID, 'mod', { limit: 20, cursor: legacyCursor }))
      .rejects.toMatchObject({ code: 'INVALID_CURSOR' });
  });

  it('rejects a malformed cursor instead of silently returning the first page', async () => {
    const { service: shared } = dependencyReadFromRows({ tables: ['resource_dependencies'], modernDependencies: [modernRow()] });
    const service = createServiceWithSharedRead(shared);
    seedPublicMod(service);

    await expect(service.getDependencies(ROOT_UUID, 'mod', { limit: 20, cursor: 'not-a-cursor' })).rejects.toThrow();
  });

  it('resolveDependencies merges modern+legacy rows through the shared projection', async () => {
    const { service: shared } = dependencyReadFromRows({
      tables: ['resource_dependencies', 'resource_version_dependencies'],
      modernDependencies: [modernRow({ id: 5, legacy_source_id: null, target_resource_id: 8, target_public_id: 'library-uuid', dependency_type: 'required', sort_order: 0 })],
      legacyDependencies: [legacyRow({ id: 12, external_identifier: 'legacy.extra', dependency_type: 'optional', sort_order: 1 })],
    });
    const service = createServiceWithSharedRead(shared);
    seedPublicMod(service);
    jest.spyOn(service as any, 'rowsFrom').mockImplementation(async (table: string) => table === 'mod_profiles'
      ? [{ mod_id: 'root.mod' }, { resource_id: 8, mod_id: 'library.mod' }]
      : []);
    jest.spyOn(service as any, 'findPublicModsByIdentifiers').mockImplementation(async (ids: string[]) => ids.map(id => ({
      resource_id: id === 'library.mod' ? 8 : 9, public_id: 'x', title: id, mod_id: id, requested_identifier: id,
    })));
    jest.spyOn(service as any, 'latestPublicModVersions').mockResolvedValue([]);

    const result = await service.resolveDependencies(ROOT_UUID, {});

    // The modern dependency resolves via its public target; the legacy row with
    // no target keeps its external identifier as an unresolved upstream entry.
    expect(result.direct.map(item => item.mod_id)).toContain('library.mod');
    expect(result.unresolved.map(item => item.mod_id)).toContain('legacy.extra');
  });

  it('fail-closed: a hidden target never contributes its declared identifier to the graph', async () => {
    const { service: shared } = dependencyReadFromRows({
      tables: ['resource_dependencies'],
      // Target 8 exists but is private/merged: the projection suppresses the
      // public_id, so the row must not surface as a resolvable node.
      modernDependencies: [modernRow({ id: 1, target_resource_id: 8, target_public_id: null, external_identifier: 'hidden.target.mod', sort_order: 0 })],
    });
    const service = createServiceWithSharedRead(shared);
    seedPublicMod(service);
    jest.spyOn(service as any, 'rowsFrom').mockImplementation(async (table: string) => table === 'mod_profiles' ? [{ mod_id: 'root.mod' }] : []);
    const findPublic = jest.spyOn(service as any, 'findPublicModsByIdentifiers').mockResolvedValue([]);

    const result = await service.resolveDependencies(ROOT_UUID, {});

    expect(result.root_mod_id).toBe('root.mod');
    expect(result.direct).toEqual([]);
    expect(result.unresolved).toEqual([]);
    expect(findPublic).not.toHaveBeenCalled();
  });
});

describe('ResourcesV2Service RES version previews', () => {
  it('advertises the selected version RES preview rather than the root renderer path', async () => {
    const previews = { getVersionResPreviewUrl: jest.fn().mockResolvedValue('https://res.example/o/version-preview/preview.png') };
    const service = new ResourcesV2Service({} as DataSource, {} as any, previews as any, {} as any);
    const resource = { id: 7, public_id: '4ab5d671-8af6-4d16-8238-7b6fd4b0a240', resource_kind: 'map', status: 'approved', is_public: 1 } as Resource;
    for (const collector of ['collectFiles', 'collectCompatibility', 'collectDependencies', 'collectVersionPreviewKeys']) {
      jest.spyOn(service as any, collector).mockResolvedValue(new Map());
    }
    const version = { id: 11, public_id: '84b37577-d086-4897-a866-658e29e0bd09', version: '1.0', status: 'published', renderer_preview_object_id: 'version-preview' };
    const versions = await (service as any).hydrateVersions(resource, [version]);
    expect(versions[0].preview_url).toBe('https://res.example/o/version-preview/preview.png');
    expect(previews.getVersionResPreviewUrl).toHaveBeenCalledWith(resource, version);
    expect(versions[0]).not.toHaveProperty('renderer_preview_object_id');
  });

  it('rejects an unpublished selection before resolving a version RES URL', async () => {
    const previews = { getVersionResPreviewUrl: jest.fn() };
    const service = new ResourcesV2Service({} as DataSource, {} as any, previews as any, {} as any);
    jest.spyOn(service as any, 'getPublicResource').mockResolvedValue({ entity: { id: 7 } });
    jest.spyOn(service as any, 'selectedVersion').mockResolvedValue(null);
    await expect(service.getVersionPreviewUrl('resource-uuid', 'version-uuid')).rejects.toThrow();
    expect(previews.getVersionResPreviewUrl).not.toHaveBeenCalled();
  });
});
