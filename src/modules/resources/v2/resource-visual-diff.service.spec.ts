import { ResourceVisualDiffService } from './resource-visual-diff.service';
import { ResourceDiffRendererError } from './resource-diff-renderer.client';

const RESOURCE_ID = '4ab5d671-8af6-4d16-8238-7b6fd4b0a240';
const FROM_ID = '16d81bd0-90c7-48ed-a371-a81059aaddc9';
const TO_ID = '26d81bd0-90c7-48ed-a371-a81059aaddc9';
const SHA = 'a'.repeat(64);

type Call = { sql: string; parameters?: unknown[] };

function resourceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 10, public_id: RESOURCE_ID, resource_kind: 'schematic', status: 'published', is_public: 1,
    visibility: 'public', deleted_at: null, merged_into_resource_id: null, user_id: 7, ...overrides,
  };
}
function versionRow(id: number, publicId: string, overrides: Record<string, unknown> = {}) {
  return {
    id, public_id: publicId, resource_id: 10, version: id === 100 ? '1.0.0' : '1.1.0', status: 'published',
    recommended: id === 101 ? 1 : 0, revision: 1, published_at: new Date(2026, 0, id === 100 ? 1 : 2),
    file_path: null, file_name: 'build.msch', file_size: 1024, content_hash: SHA,
    game_version_min: null, game_version_max: null, ...overrides,
  };
}

function harness(options: {
  enabled?: boolean; stored?: any; lockAcquired?: boolean; renderer?: any; kind?: 'schematic' | 'map';
} = {}) {
  const calls: Call[] = [];
  const query = jest.fn(async (sql: string, parameters?: unknown[]) => {
    calls.push({ sql, parameters });
    if (sql.includes('FROM resources WHERE public_id')) return [resourceRow({ resource_kind: options.kind || 'schematic' })];
    if (sql.includes('FROM resource_members')) return [];
    if (sql.includes('FROM resource_versions WHERE resource_id')) return [versionRow(101, TO_ID), versionRow(100, FROM_ID)];
    if (sql.includes('FROM resource_version_diffs')) return options.stored ? [options.stored] : [];
    if (sql.includes('FROM resource_files')) return [{ resource_version_id: 100, role: 'primary', public_id: 'file-a', storage_backend: 'managed', storage_key: 'a' }];
    if (sql.includes('FROM resource_dependencies')) return [
      { resource_version_id: 100, external_identifier: 'mod-a' },
      { resource_version_id: 101, external_identifier: 'mod-b' },
    ];
    if (sql.includes('FROM map_wave_summaries')) return [
      { resource_version_id: 100, wave_start: 1, wave_end: 2, estimated_health: 100, strength: 1, boss_count: 0 },
      { resource_version_id: 101, wave_start: 1, wave_end: 2, estimated_health: 200, strength: 2, boss_count: 1 },
    ];
    if (sql.includes('INSERT INTO resource_version_diffs')) return { affectedRows: 1 };
    return [];
  });
  const redis = {
    setIfNotExists: jest.fn().mockResolvedValue(options.lockAcquired ?? true),
    getAndDeleteIfMatches: jest.fn().mockResolvedValue('1'),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  };
  const renderer = options.renderer ?? {
    configured: true,
    compareSchematic: jest.fn().mockResolvedValue({
      schemaVersion: 2, mode: 'full', fallbackReason: null, unknownContent: [], diffOverlayKey: null,
      diff: {
        schema_version: 2, mode: 'full', kind: 'schematic',
        blocks: { added: [{ x: 1, y: 1, block: 'conveyor', rotation: 0 }], removed: [], modified: [], truncated: false },
        materials_delta: [], power_delta: { net: { before: 0, after: 1, delta: 1 }, estimated: true },
        logic_diffs: [], logic_truncated: false, metadata: {}, estimated: true,
      },
    }),
    compareMap: jest.fn(),
    mapChunk: jest.fn(),
  };
  const fileProvider = { getReadableContent: jest.fn().mockResolvedValue(Buffer.from('msch-test')) };
  const previews = { readDiffOverlay: jest.fn().mockResolvedValue(Buffer.from('png')) };
  const settings = { getBoolean: jest.fn().mockResolvedValue(options.enabled ?? true) };
  const service = new ResourceVisualDiffService(
    { query } as any, settings as any, { isEnabled: () => true } as any, redis as any,
    renderer as any, fileProvider as any, {} as any, previews as any,
  );
  return { service, calls, query, redis, renderer, fileProvider, previews, settings };
}

describe('ResourceVisualDiffService', () => {
  it('returns disabled when the runtime flag is off', async () => {
    const { service, query } = harness({ enabled: false });
    const result = await service.getDiff(RESOURCE_ID, 'schematic', { to_version_public_id: TO_ID });
    expect(result.statusCode).toBe(200);
    expect(result.data.status).toBe('disabled');
    expect(query).not.toHaveBeenCalled();
  });

  it('serves a stored schema v2 diff without touching the renderer', async () => {
    const diff = { schema_version: 2, mode: 'full', kind: 'schematic', blocks: { added: [], removed: [], modified: [], truncated: false } };
    const { service, renderer } = harness({ stored: { diff_json: diff, parser_version: 'p1', status: 'completed' } });
    const result = await service.getDiff(RESOURCE_ID, 'schematic', { to_version_public_id: TO_ID });
    expect(result.statusCode).toBe(200);
    expect(result.data.status).toBe('completed');
    expect(result.data.diff).toEqual(diff);
    expect(renderer.compareSchematic).not.toHaveBeenCalled();
  });

  it('returns 202 while another request holds the compute lock', async () => {
    const { service, renderer } = harness({ lockAcquired: false });
    const result = await service.getDiff(RESOURCE_ID, 'schematic', { to_version_public_id: TO_ID });
    expect(result.statusCode).toBe(202);
    expect(result.data.status).toBe('computing');
    expect(result.data.retry_after_ms).toBe(1500);
    expect(renderer.compareSchematic).not.toHaveBeenCalled();
  });

  it('computes, enriches and persists a schematic diff', async () => {
    const { service, calls } = harness();
    const result = await service.getDiff(RESOURCE_ID, 'schematic', { to_version_public_id: TO_ID });
    expect(result.statusCode).toBe(200);
    expect(result.data.status).toBe('completed');
    expect(result.data.from_version_public_id).toBe(FROM_ID);
    expect(result.data.to_version_public_id).toBe(TO_ID);
    const insert = calls.find((call) => call.sql.includes('INSERT INTO resource_version_diffs'));
    expect(insert).toBeTruthy();
    expect(insert!.parameters?.[5]).toBe('completed');
    expect(JSON.parse(String(insert!.parameters?.[3]))).toMatchObject({ schema_version: 2, mode: 'full' });
  });

  it('degrades modded content to a persisted metadata_only diff instead of failing', async () => {
    const renderer = {
      configured: true,
      compareSchematic: jest.fn().mockRejectedValue(new ResourceDiffRendererError('UNSUPPORTED_MOD_CONTENT', true, 'modded')),
      compareMap: jest.fn(), mapChunk: jest.fn(),
    };
    const { service, calls } = harness({ renderer });
    const result = await service.getDiff(RESOURCE_ID, 'schematic', { to_version_public_id: TO_ID });
    expect(result.statusCode).toBe(200);
    expect(result.data.status).toBe('metadata_only');
    expect(result.data.diff).toMatchObject({
      schema_version: 2, mode: 'metadata_only',
      fallback_reason: 'MODDED_CONTENT_NOT_SUPPORTED_BY_VANILLA_RENDERER',
      file_delta: { size_from: 1024, size_to: 1024, sha256_changed: false },
      dependencies_delta: { added: ['mod-b'], removed: ['mod-a'] },
    });
    const insert = calls.find((call) => call.sql.includes('INSERT INTO resource_version_diffs'));
    expect(insert!.parameters?.[5]).toBe('metadata_only');
  });

  it('does not cache an offset-adjusted comparison', async () => {
    const { service, calls, redis } = harness();
    const result = await service.getDiff(RESOURCE_ID, 'schematic', { to_version_public_id: TO_ID, offset_x: 3 });
    expect(result.data.status).toBe('completed');
    expect(calls.some((call) => call.sql.includes('INSERT INTO resource_version_diffs'))).toBe(false);
    expect(redis.setIfNotExists).not.toHaveBeenCalled();
  });

  it('returns unavailable (not 500) when the renderer is not configured', async () => {
    const renderer = { configured: false, compareSchematic: jest.fn(), compareMap: jest.fn(), mapChunk: jest.fn() };
    const { service } = harness({ renderer });
    const result = await service.getDiff(RESOURCE_ID, 'schematic', { to_version_public_id: TO_ID });
    expect(result.statusCode).toBe(200);
    expect(result.data.status).toBe('unavailable');
    expect(result.data.reason).toBe('renderer_unavailable');
  });

  it('reads a 128x128 chunk only after the full diff exists', async () => {
    const stored = {
      diff_json: { schema_version: 2, mode: 'full', kind: 'map' }, parser_version: 'p1', status: 'completed',
    };
    const renderer = {
      configured: true, compareSchematic: jest.fn(), compareMap: jest.fn(),
      mapChunk: jest.fn().mockResolvedValue({
        schemaVersion: 2, mode: 'full', fallbackReason: null,
        chunk: { cx: 2, cy: 3, tileWidth: 128, tileHeight: 128, floorChanged: true, overlayChanged: false, floorRuns: [], overlayRuns: [], truncated: false },
      }),
    };
    const { service, redis } = harness({ stored, renderer, kind: 'map' });
    const result = await service.getChunk(RESOURCE_ID, { to_version_public_id: TO_ID, cx: 2, cy: 3 });
    expect(result.statusCode).toBe(200);
    expect(result.data.status).toBe('ready');
    expect((result.data as any).chunk.floorChanged).toBe(true);
    expect(redis.set).toHaveBeenCalledWith(expect.stringContaining('forum:res-diff-chunk'), expect.any(String), 3600);
  });

  it('rejects overlay keys that were not persisted by the diff service', async () => {
    const stored = { diff_json: { schema_version: 2, mode: 'full', diff_overlay_preview_key: '../../etc/passwd' }, parser_version: 'p1', status: 'completed' };
    const { service, previews } = harness({ stored, kind: 'map' });
    await expect(service.readOverlay(RESOURCE_ID, { to_version_public_id: TO_ID })).rejects.toThrow('差异叠加层不存在');
    expect(previews.readDiffOverlay).not.toHaveBeenCalled();
  });
});
