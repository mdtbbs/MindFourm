import { DataSource } from 'typeorm';
import { Resource } from '@entities/resource.entity';
import { ResourcesV2Service } from './resources-v2.service';

describe('ResourcesV2Service relation projection', () => {
  it('does not advertise a Resource preview before any binary version is published', () => {
    const service = new ResourcesV2Service({} as DataSource, {} as any, {} as any);
    const resource = {
      id: 7, public_id: '4ab5d671-8af6-4d16-8238-7b6fd4b0a240', resource_kind: 'map',
      status: 'approved', is_public: 1, latest_published_version_id: null,
      file_path: '/uploads/.quarantine/resources/initial.msav',
      renderer_status: 'ready', renderer_preview_key: `resources/map/aa/${'a'.repeat(64)}/preview.png`,
    } as Resource;

    expect((service as any).resourcePreviewUrl(resource)).toBeNull();
  });

  it('preserves the recommended_for context and defaults unknown contexts to general', async () => {
    const service = new ResourcesV2Service({} as DataSource, {} as any, {} as any);
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
    const service = new ResourcesV2Service({} as DataSource, {} as any, {} as any);
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
    const service = new ResourcesV2Service({} as DataSource, {} as any, {} as any);
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
    const service = new ResourcesV2Service({} as DataSource, {} as any, {} as any);
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
    const service = new ResourcesV2Service({} as DataSource, {} as any, {} as any);
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
    const service = new ResourcesV2Service({} as DataSource, {} as any, {} as any);
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
    const service = new ResourcesV2Service({} as DataSource, {} as any, {} as any);
    jest.spyOn(service as any, 'rowsFrom').mockImplementation(async (_table: string, sql: string) => sql.includes('FROM map_wave_summaries')
      ? [{ wave_start: 2, wave_end: 2, enemy_count: null, estimated_health: null, air_ratio: null, boss_count: 0, strength: null, is_spike: 0 }]
      : []);

    const result = await (service as any).analysisData(70, 'map');

    expect(result).toMatchObject({ difficulty_confidence: 'estimated', waves: [{ wave_start: 2, wave_end: 2 }] });
    expect(result.estimated_difficulty).toBeNull();
  });
});
