import { DataSource } from 'typeorm';
import { Resource } from '@entities/resource.entity';
import { ResourcesV2Service } from './resources-v2.service';

describe('ResourcesV2Service relation projection', () => {
  it('preserves the recommended_for context and defaults unknown contexts to general', async () => {
    const service = new ResourcesV2Service({} as DataSource, {} as any, {} as any);
    const resource = { id: 7 } as Resource;
    const contexts = ['opening', 'production', 'defense', 'logistics', 'general', 'unexpected'];
    jest.spyOn(service as any, 'rowsFrom').mockResolvedValue(contexts.map((relation_context, index) => ({
      id: index + 1,
      relation_type: 'recommended_for',
      relation_context,
      created_at: new Date('2026-10-05T00:00:00.000Z'),
      peer_public_id: '4ab5d671-8af6-4d16-8238-7b6fd4b0a240',
      peer_title: 'Example map',
      peer_kind: 'map',
      peer_version_public_id: null,
    })));

    const result = await (service as any).relationPage(resource, { limit: 20 });

    expect(result.items.map((item: any) => item.relation_context)).toEqual([
      'opening', 'production', 'defense', 'logistics', 'general', 'general',
    ]);
    expect(result.items.every((item: any) => item.relation_type === 'recommended_for')).toBe(true);
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
