import { ResourceEmbedService } from './resource-embed.service';

const PUBLIC_ID = '4ab5d671-8af6-4d16-8238-7b6fd4b0a240';
const PRIVATE_ID = '5bb5d671-8af6-4d16-8238-7b6fd4b0a241';
const VERSION_ID = '16d81bd0-90c7-48ed-a371-a81059aaddc9';

type QueryCall = { sql: string; parameters?: unknown[] };

function makeDataSource(overrides: { resourceRows?: any[]; versionRows?: any[]; schematics?: any[]; materials?: any[]; analyses?: any[]; logic?: any[]; maps?: any[]; mapAnalyses?: any[]; waves?: any[]; files?: any[]; memberships?: any[] } = {}) {
  const calls: QueryCall[] = [];
  const query = jest.fn(async (sql: string, parameters?: unknown[]) => {
    calls.push({ sql, parameters });
    if (sql.includes('FROM resources r LEFT JOIN users')) return overrides.resourceRows ?? [];
    if (sql.includes('FROM resource_members')) return overrides.memberships ?? [];
    if (sql.includes('FROM resource_versions')) return overrides.versionRows ?? [];
    if (sql.includes('FROM schematic_version_metadata')) return overrides.schematics ?? [];
    if (sql.includes('FROM schematic_materials')) return overrides.materials ?? [];
    if (sql.includes('FROM schematic_analyses')) return overrides.analyses ?? [];
    if (sql.includes('FROM schematic_logic_processors')) return overrides.logic ?? [];
    if (sql.includes('FROM map_version_metadata')) return overrides.maps ?? [];
    if (sql.includes('FROM map_analyses')) return overrides.mapAnalyses ?? [];
    if (sql.includes('FROM map_wave_summaries')) return overrides.waves ?? [];
    if (sql.includes('FROM resource_files')) return overrides.files ?? [];
    return [];
  });
  return { dataSource: { query } as any, calls };
}

function resourceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 10, public_id: PUBLIC_ID, title: '铜墙阵列', summary: '一个测试蓝图', resource_kind: 'schematic',
    status: 'published', is_public: 1, visibility: 'public', deleted_at: null, merged_into_resource_id: null,
    user_id: 7, latest_published_version_id: 100, renderer_status: 'ready', username: 'builder', avatar_url: null,
    ...overrides,
  };
}

function versionRow(overrides: Record<string, unknown> = {}) {
  return { id: 100, public_id: VERSION_ID, resource_id: 10, version: '1.2.0', status: 'published', published_at: new Date(), revision: 1, ...overrides };
}

describe('ResourceEmbedService', () => {
  it('batches all tables and builds a schematic card with theoretical power', async () => {
    const { dataSource, calls } = makeDataSource({
      resourceRows: [resourceRow()],
      versionRows: [versionRow()],
      schematics: [{ resource_version_id: 100, width: 10, height: 8, block_count: 42 }],
      materials: [
        { resource_version_id: 100, internal_name: 'copper', amount: 120 },
        { resource_version_id: 100, internal_name: 'lead', amount: 30 },
      ],
      analyses: [{ resource_version_id: 100, production_json: { power: { generated: 60, consumed: 90, net: -30 } } }],
      logic: [{ resource_version_id: 100, count: 2 }],
      files: [{ resource_version_id: 100, public_id: '8cc5d671-8af6-4d16-8238-7b6fd4b0a242', availability_status: 'available' }],
    });
    const service = new ResourceEmbedService(dataSource);
    const cards = await service.getCards([PUBLIC_ID]);

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      resource_public_id: PUBLIC_ID, version_public_id: VERSION_ID, status: 'available', resource_kind: 'schematic',
      title: '铜墙阵列', url: `/resources/${PUBLIC_ID}`,
      preview_url: `/api/v1/resources/${PUBLIC_ID}/versions/${VERSION_ID}/preview`,
      download_url: `/api/v1/resources/${PUBLIC_ID}/versions/${VERSION_ID}/files/8cc5d671-8af6-4d16-8238-7b6fd4b0a242/download`,
      schematic: {
        width: 10, height: 8, block_count: 42,
        top_materials: [{ internal_name: 'copper', amount: 120 }, { internal_name: 'lead', amount: 30 }],
        power: { production: 60, consumption: 90, net: -30, estimated: true },
        has_logic: true, logic_processor_count: 2,
      },
    });
    const tables = new Set(calls.map((call) => call.sql.match(/FROM (\w+)/)?.[1]));
    expect(tables).toEqual(new Set(['resources', 'resource_versions', 'schematic_version_metadata', 'schematic_materials', 'schematic_analyses', 'schematic_logic_processors', 'resource_files']));
  });

  it('never leaks a private resource title to an anonymous reader', async () => {
    const { dataSource } = makeDataSource({ resourceRows: [resourceRow({ status: 'pending_review', is_public: 0 })] });
    const service = new ResourceEmbedService(dataSource);
    const cards = await service.getCards([PUBLIC_ID]);
    expect(cards[0]).toMatchObject({ status: 'unavailable', title: null, preview_url: null, resource_kind: null, reason: 'not_public' });
  });

  it('shows the owner their own pending resource as a review preview', async () => {
    const { dataSource } = makeDataSource({
      resourceRows: [resourceRow({ status: 'pending_review', is_public: 0, user_id: 7 })],
      versionRows: [versionRow({ status: 'pending_review', published_at: null })],
      schematics: [{ resource_version_id: 100, width: 4, height: 4, block_count: 3 }],
    });
    const service = new ResourceEmbedService(dataSource);
    const cards = await service.getCards([PUBLIC_ID], { id: 7, role: 'user' });
    expect(cards[0]).toMatchObject({
      status: 'pending_review', title: '铜墙阵列', version_public_id: VERSION_ID,
      preview_url: null, reason: 'pending_review',
    });
  });

  it('treats deleted, merged and unsupported kinds as unavailable without metadata', async () => {
    const { dataSource } = makeDataSource({ resourceRows: [
      resourceRow({ id: 11, public_id: PRIVATE_ID, deleted_at: new Date() }),
      resourceRow({ id: 12, public_id: '6cc5d671-8af6-4d16-8238-7b6fd4b0a243', resource_kind: 'other' }),
    ] });
    const service = new ResourceEmbedService(dataSource);
    const cards = await service.getCards([PRIVATE_ID, '6cc5d671-8af6-4d16-8238-7b6fd4b0a243']);
    expect(cards.map((card) => card.status)).toEqual(['unavailable', 'unavailable']);
    expect(cards.map((card) => card.title)).toEqual([null, null]);
  });

  it('hydrates many documents with a single resources query', async () => {
    const { dataSource, calls } = makeDataSource({
      resourceRows: [resourceRow()],
      versionRows: [versionRow()],
      schematics: [{ resource_version_id: 100, width: 10, height: 8, block_count: 42 }],
    });
    const service = new ResourceEmbedService(dataSource);
    const doc = (id: string) => ({
      type: 'doc',
      content: [{ type: 'resourceEmbed', attrs: { resourcePublicId: id, displayMode: 'card' } }],
    });
    const projections = await service.hydrateMany([doc(PUBLIC_ID), doc(PUBLIC_ID), null]);
    expect(projections[0]?.content_html).toContain('[资源卡片: 铜墙阵列 (schematic)]');
    expect(projections[1]?.embeds).toHaveLength(1);
    expect(projections[2]).toBeNull();
    expect(calls.filter((call) => call.sql.includes('FROM resources r LEFT JOIN users'))).toHaveLength(1);
  });

  it('rejects malformed identifiers instead of querying with them', async () => {
    const { dataSource, calls } = makeDataSource();
    const service = new ResourceEmbedService(dataSource);
    await expect(service.getCards(['not-a-uuid', '../../etc/passwd'])).resolves.toEqual([]);
    expect(calls).toHaveLength(0);
  });
});
