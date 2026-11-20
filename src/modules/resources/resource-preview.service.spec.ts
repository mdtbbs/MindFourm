import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { ResourcePreviewService } from './resource-preview.service';

function waitFor(condition: () => boolean, timeoutMs = 2_000): Promise<void> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (condition()) return resolve();
      if (Date.now() - started > timeoutMs) return reject(new Error('waitFor timed out'));
      setTimeout(poll, 10);
    };
    poll();
  });
}

describe('ResourcePreviewService', () => {
  const resClient = () => ({
    isAvailable: true,
    isReachable: true,
    uploadServerGeneratedObject: jest.fn().mockResolvedValue({ public_id: 'res-preview' }),
    createBinding: jest.fn().mockResolvedValue({ id: 'binding-preview' }),
    deleteBinding: jest.fn().mockResolvedValue(undefined),
    createPrivateDownloadUrl: jest.fn().mockResolvedValue({ url: 'https://res.example/private/token' }),
    buildPublicDownloadUrl: jest.fn().mockReturnValue('https://res.example/o/res-preview/preview.png'),
  });
  const originalUrl = process.env.RESOURCE_RENDERER_URL;
  const originalRoot = process.env.RESOURCE_PREVIEW_ROOT;
  const originalToken = process.env.RESOURCE_RENDERER_TOKEN;
  const originalFetch = global.fetch;

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.RESOURCE_RENDERER_URL; else process.env.RESOURCE_RENDERER_URL = originalUrl;
    if (originalRoot === undefined) delete process.env.RESOURCE_PREVIEW_ROOT; else process.env.RESOURCE_PREVIEW_ROOT = originalRoot;
    if (originalToken === undefined) delete process.env.RESOURCE_RENDERER_TOKEN; else process.env.RESOURCE_RENDERER_TOKEN = originalToken;
    global.fetch = originalFetch;
  });


  it('preserves nested official connection and logic metadata without exposing extra top-level fields', () => {
    const service = new ResourcePreviewService({} as any);
    const blocks = [{ positions: [{ config: { type: 'points', value: [{ x: 2, y: -1 }] }, logic_links: [{ x: 4, y: 3, name: 'switch1' }] }] }];
    const metadata = (service as any).safeMetadata({ blocks, width: 6, token: 'private', tile_layers: { terrain: Array.from({ length: 10001 }, (_, x) => ({ x, y: 0, floor: 'stone', overlay: 'air' })) } });
    expect(metadata.blocks).toEqual(blocks);
    expect(metadata.token).toBeUndefined();
    expect(metadata.tile_layers.terrain).toHaveLength(10000);
    expect(metadata.tile_layers_truncated).toBe(true);
  });

  it('persists the analysis projections the detail page, compatibility panel and duplicate check read', () => {
    const service = new ResourcePreviewService({} as any);
    const metadata = (service as any).safeMetadata({
      width: 12, height: 8,
      estimated_build_time_seconds: 187.4, estimated_build_time_method: 'sum_of_block_build_time_ticks_divided_by_60',
      schematic_format_version: 1, save_format_version: 3,
      map_build_metadata: { stored_game_build: 160, source: 'file_metadata' },
      parser_runtime: { mindustry_build: 160.5, renderer_version: 'v160.5' },
      compatibility: { minimum_supported_build: 151, confidence: 'high' },
      unknown_content: ['example-mod-block'],
      structure_hash: 'a'.repeat(64), normalized_structure_hash: 'b'.repeat(64),
      production: { mode: 'theoretical', complete: true, available: true },
      private_note: 'must not persist',
    });

    expect(metadata).toMatchObject({
      estimated_build_time_seconds: 187.4,
      estimated_build_time_method: 'sum_of_block_build_time_ticks_divided_by_60',
      schematic_format_version: 1,
      save_format_version: 3,
      map_build_metadata: { stored_game_build: 160, source: 'file_metadata' },
      parser_runtime: { mindustry_build: 160.5, renderer_version: 'v160.5' },
      compatibility: { minimum_supported_build: 151, confidence: 'high' },
      unknown_content: ['example-mod-block'],
      structure_hash: 'a'.repeat(64),
      normalized_structure_hash: 'b'.repeat(64),
    });
    expect(metadata.private_note).toBeUndefined();
  });

  it('re-parses a legacy map once and writes the analysis projections back', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mindfourm-backfill-'));
    const source = path.join(root, 'map.msav');
    const input = Buffer.from('legacy map payload');
    const hash = crypto.createHash('sha256').update(input).digest('hex');
    await fs.writeFile(source, input);
    process.env.RESOURCE_RENDERER_URL = 'http://127.0.0.1:6100';
    process.env.RESOURCE_PREVIEW_ROOT = root;
    const update = jest.fn().mockResolvedValue(undefined);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        previewKey: `resources/map/${hash.slice(0, 2)}/${hash}/preview.png`,
        parserVersion: 'renderer-2',
        metadata: { name: 'Legacy', width: 32, height: 24, tile_layers: { resources: [{ x: 1, y: 1, name: 'copper' }] }, wave_groups: [{ begin: 1, end: 3, amount: 2 }] },
      }),
    }) as any;
    const service = new ResourcePreviewService({ update } as any);
    const legacy = { id: 9, resource_kind: 'map', file_path: source, file_name: 'map.msav', file_size: input.length, content_hash: hash, renderer_status: 'ready', renderer_metadata_json: { name: 'Legacy', width: 32, height: 24 } } as any;

    service.ensureAnalysisMetadata(legacy);
    // The guard makes the second call within the hour a no-op, so one public
    // page render cannot cause a renderer stampede.
    service.ensureAnalysisMetadata(legacy);
    await waitFor(() => update.mock.calls.length > 0);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(9, expect.objectContaining({
      renderer_metadata_json: expect.objectContaining({ tile_layers: { resources: [{ x: 1, y: 1, name: 'copper' }] } }),
      renderer_parser_version: 'renderer-2',
    }));
    await fs.rm(root, { recursive: true, force: true });
  });

  it('does not re-parse metadata that already carries the analysis projections', () => {
    process.env.RESOURCE_RENDERER_URL = 'http://127.0.0.1:6100';
    global.fetch = jest.fn() as any;
    const service = new ResourcePreviewService({ update: jest.fn() } as any);

    service.ensureAnalysisMetadata({ id: 10, resource_kind: 'map', renderer_status: 'ready', renderer_metadata_json: { tile_layers: {}, wave_groups: [] } } as any);
    service.ensureAnalysisMetadata({ id: 11, resource_kind: 'schematic', renderer_status: 'ready', renderer_metadata_json: { production: { available: true }, estimated_build_time_seconds: 12 } } as any);
    // Queueing is asynchronous; nothing should have been scheduled at all.
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('keeps version previews private until the resource and version are published and retains the PNG', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mindfourm-version-preview-'));
    try {
      process.env.RESOURCE_PREVIEW_ROOT = root;
      const hash = 'a'.repeat(64);
      const key = `resources/map/aa/${hash}/preview.png`;
      await fs.mkdir(path.dirname(path.join(root, key)), { recursive: true });
      await fs.writeFile(path.join(root, key), Buffer.from('version preview'));
      const client = resClient();
      const references = jest.fn().mockResolvedValue([{ id: 11 }]);
      const service = new ResourcePreviewService({ update: jest.fn(), manager: { query: references } } as any, undefined, undefined, undefined, client as any);
      const resource = { id: 7, status: 'approved', is_public: 1, visibility: 'public', resource_kind: 'map' } as any;
      const version = { id: 11, public_id: 'version-11', status: 'pending_review', content_hash: hash } as any;
      const refs = await service.storeVersionPreviewInRes(resource, version, key);
      expect(client.createBinding).toHaveBeenLastCalledWith('res-preview', expect.objectContaining({ owner_type: 'resource_version_preview', owner_id: 'version-11', visibility: 'private' }));
      Object.assign(version, refs);
      await expect(service.getVersionResPreviewUrl(resource, version)).resolves.toBe('https://res.example/private/token');
      await service.setVersionResPreviewVisibility(resource, version, 'public');
      expect(client.createBinding).toHaveBeenLastCalledWith('res-preview', expect.objectContaining({ visibility: 'private' }));
      version.status = 'published';
      await service.setVersionResPreviewVisibility(resource, version, 'public');
      expect(client.createBinding).toHaveBeenLastCalledWith('res-preview', expect.objectContaining({ visibility: 'public' }));
      await expect(service.getVersionResPreviewUrl(resource, version)).resolves.toBe('https://res.example/o/res-preview/preview.png');
      await service.setVersionResPreviewVisibility({ ...resource, is_public: 0 }, version, 'public');
      expect(client.createBinding).toHaveBeenLastCalledWith('res-preview', expect.objectContaining({ visibility: 'private' }));
      await service.removePreviewKey(key);
      expect(references).toHaveBeenCalledWith(expect.stringContaining('map_version_metadata'), [key, key, key]);
      expect((await fs.stat(path.join(root, key))).isFile()).toBe(true);
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  });

  it('rejects newly rendered drafts when RES is unavailable', async () => {
    process.env.RESOURCE_RENDERER_URL = 'http://127.0.0.1:6100';
    const service = new ResourcePreviewService({} as any, undefined, undefined, undefined, { isAvailable: false, isReachable: false } as any);
    await expect(service.createDraft(17, 'map', { file_size: 10 } as any)).rejects.toThrow('资源存储服务暂不可用');
  });

  it('accepts only a content-addressed preview key and strips unexpected renderer metadata', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mindfourm-preview-'));
    const source = path.join(root, 'map.msav');
    const input = Buffer.from('map payload');
    const hash = crypto.createHash('sha256').update(input).digest('hex');
    await fs.writeFile(source, input);
    process.env.RESOURCE_RENDERER_URL = 'http://127.0.0.1:6100';
    process.env.RESOURCE_PREVIEW_ROOT = root;
    process.env.RESOURCE_RENDERER_TOKEN = 'renderer-secret';
    const update = jest.fn().mockResolvedValue(undefined);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        previewKey: `resources/map/${hash.slice(0, 2)}/${hash}/preview.png`,
        parserVersion: 'renderer-1',
        metadata: { name: 'Alpha', width: 40, tile_layers: { terrain: [{ x: 1, y: 2, name: 'sand' }] }, tile_layers_truncated: true, ignored: 'must not persist' },
      }),
    }) as any;
    const service = new ResourcePreviewService({ update } as any);

    await service.enqueue({ id: 7, resource_kind: 'map', file_path: source, file_name: 'map.msav', file_size: input.length, content_hash: hash } as any);

    expect(global.fetch).toHaveBeenCalledWith('http://127.0.0.1:6100/v1/analyze', expect.objectContaining({
      headers: expect.objectContaining({ authorization: 'Bearer renderer-secret' }),
    }));
    expect(update).toHaveBeenLastCalledWith(7, expect.objectContaining({
      renderer_status: 'ready',
      renderer_preview_key: `resources/map/${hash.slice(0, 2)}/${hash}/preview.png`,
      renderer_metadata_json: { name: 'Alpha', width: 40, tile_layers: { terrain: [{ x: 1, y: 2, name: 'sand' }] }, tile_layers_truncated: true },
    }));
    await fs.rm(root, { recursive: true, force: true });
  });

  it('stores a new preview in RES with a private binding, then makes it public on approval', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mindfourm-preview-res-'));
    try {
      const hash = 'a'.repeat(64);
      const key = `resources/map/${hash.slice(0, 2)}/${hash}/preview.png`;
      await fs.mkdir(path.dirname(path.join(root, key)), { recursive: true });
      await fs.writeFile(path.join(root, key), Buffer.from('preview png'));
      process.env.RESOURCE_PREVIEW_ROOT = root;
      const update = jest.fn().mockResolvedValue(undefined);
      const client = {
        isAvailable: true,
        isReachable: true,
        uploadServerGeneratedObject: jest.fn().mockResolvedValue({ public_id: 'res-preview' }),
        createBinding: jest.fn().mockResolvedValue({ id: 'binding-preview' }),
        buildPublicDownloadUrl: jest.fn().mockReturnValue('https://res.example/o/res-preview/preview.png'),
        createPrivateDownloadUrl: jest.fn().mockResolvedValue({ url: 'https://res.example/private/token' }),
      };
      const service = new ResourcePreviewService({ update } as any, undefined, undefined, undefined, client as any);
      const resource = { id: 7, public_id: 'resource-7', is_public: 1, resource_kind: 'map', content_hash: hash, status: 'pending', renderer_status: 'ready' } as any;
      await service.storePreviewInRes(resource, key);
      expect(client.createBinding).toHaveBeenCalledWith('res-preview', expect.objectContaining({ owner_id: 'resource-7', visibility: 'private' }));
      expect(update).toHaveBeenCalledWith(7, expect.objectContaining({ renderer_preview_object_id: 'res-preview', renderer_preview_binding_id: 'binding-preview', renderer_preview_key: null }));
      expect((await fs.stat(path.join(root, key))).isFile()).toBe(true);
      const withReference = { ...resource, renderer_preview_object_id: 'res-preview', renderer_preview_binding_id: 'binding-preview' };
      expect(await service.getResPreviewUrl(withReference)).toBe('https://res.example/private/token');
      await service.setResPreviewVisibility(withReference, 'public');
      expect(client.createBinding).toHaveBeenLastCalledWith('res-preview', expect.objectContaining({ visibility: 'private' }));
      await service.setResPreviewVisibility({ ...withReference, status: 'approved' }, 'public');
      expect(client.createBinding).toHaveBeenLastCalledWith('res-preview', expect.objectContaining({ visibility: 'public' }));
      expect(await service.getResPreviewUrl({ ...withReference, status: 'approved' })).toBe('https://res.example/o/res-preview/preview.png');
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  });

  it('does not trust a renderer key that points outside its content-addressed location', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mindfourm-preview-'));
    const source = path.join(root, 'blueprint.msch');
    const input = Buffer.from('blueprint payload');
    const hash = crypto.createHash('sha256').update(input).digest('hex');
    await fs.writeFile(source, input);
    process.env.RESOURCE_RENDERER_URL = 'http://127.0.0.1:6100';
    const update = jest.fn().mockResolvedValue(undefined);
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ previewKey: '../private.png' }) }) as any;
    const service = new ResourcePreviewService({ update } as any);

    await service.enqueue({ id: 8, resource_kind: 'schematic', file_path: source, file_name: 'blueprint.msch', file_size: input.length, content_hash: hash } as any);

    expect(update).toHaveBeenLastCalledWith(8, { renderer_status: 'failed', renderer_error_code: 'INVALID_RENDER_RESULT', renderer_preview_key: null });
    await fs.rm(root, { recursive: true, force: true });
  });

  it('keeps pre-submit previews private to their creator until consumed', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mindfourm-preview-'));
    const source = path.join(root, 'blueprint.msch');
    const input = Buffer.from('blueprint payload');
    const hash = crypto.createHash('sha256').update(input).digest('hex');
    const key = `resources/schematic/${hash.slice(0, 2)}/${hash}/preview.png`;
    const previewPath = path.join(root, key);
    await fs.writeFile(source, input);
    await fs.mkdir(path.dirname(previewPath), { recursive: true });
    await fs.writeFile(previewPath, Buffer.from('private preview'));
    process.env.RESOURCE_RENDERER_URL = 'http://127.0.0.1:6100';
    process.env.RESOURCE_PREVIEW_ROOT = root;
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ previewKey: key, metadata: { name: 'Private' } }) }) as any;
    const client = resClient();
    const service = new ResourcePreviewService({ update: jest.fn() } as any, { removeManaged: jest.fn() } as any, undefined, undefined, client as any);

    const draft = await service.createDraft(17, 'schematic', {
      file_name: 'blueprint.msch', file_path: source, file_size: input.length,
      mime_type: 'application/octet-stream', content_hash: hash,
    });

    expect(client.createBinding).toHaveBeenCalledWith('res-preview', expect.objectContaining({ owner_type: 'resource_preview_draft', owner_id: draft.id, visibility: 'private' }));
    await expect(service.getDraftResPreviewUrl(17, draft.id)).resolves.toBe('https://res.example/private/token');
    await expect(service.getDraftResPreviewUrl(18, draft.id)).rejects.toThrow('预览草稿不存在或已过期');
    await expect(service.readDraftPreview(17, draft.id)).resolves.toEqual(Buffer.from('private preview'));
    await expect(service.readDraftPreview(18, draft.id)).rejects.toThrow('预览草稿不存在或已过期');
    await expect(service.takeDraft(18, draft.id, 'schematic')).rejects.toThrow('预览草稿不存在或已过期');
    await expect(service.takeDraft(17, draft.id, 'schematic')).resolves.toMatchObject({ file_path: source });
    await fs.rm(root, { recursive: true, force: true });
  });

  it('returns the validated server parse result with a consumed submission draft', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mindfourm-preview-'));
    const source = path.join(root, 'map.msav');
    const input = Buffer.from('map payload');
    const hash = crypto.createHash('sha256').update(input).digest('hex');
    const key = `resources/map/${hash.slice(0, 2)}/${hash}/preview.png`;
    await fs.writeFile(source, input);
    await fs.mkdir(path.dirname(path.join(root, key)), { recursive: true });
    await fs.writeFile(path.join(root, key), Buffer.from('preview'));
    process.env.RESOURCE_RENDERER_URL = 'http://127.0.0.1:6100';
    process.env.RESOURCE_PREVIEW_ROOT = root;
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ previewKey: key, parserVersion: 'renderer-2', metadata: { width: 32, height: 16 } }) }) as any;
    const service = new ResourcePreviewService({ update: jest.fn() } as any, undefined, undefined, undefined, resClient() as any);
    const preview = await service.createDraft(17, 'map', { file_name: 'map.msav', file_path: source, file_size: input.length, mime_type: 'application/octet-stream', content_hash: hash });
    const consumed = await service.consumeDraft(17, preview.id, 'map');
    expect(consumed).toEqual({ file: expect.objectContaining({ file_path: source }), previewKey: key, parserVersion: 'renderer-2', metadata: { width: 32, height: 16 } });
    await service.discardConsumedDraft(consumed);
    await expect(fs.access(path.join(root, key))).rejects.toThrow();
    await fs.rm(root, { recursive: true, force: true });
  });

  it('resolves item and block names and icons in one renderer request while keeping unknown IDs safe', async () => {
    process.env.RESOURCE_RENDERER_URL = 'http://127.0.0.1:6100/';
    process.env.RESOURCE_RENDERER_TOKEN = 'renderer-secret';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: {
          copper: { name: '铜', icon: 'data:image/png;base64,Y29wcGVy' },
          'some-mod-item': { name: 'some-mod-item', icon: null },
          ignored: { name: 'ignored', icon: 'https://example.com/not-an-image.png' },
        },
        blocks: { 'water-extractor': { name: '抽水机', icon: 'data:image/png;base64,d2F0ZXItZXh0cmFjdG9y' } },
        liquids: { water: { name: '水', icon: null } },
      }),
    }) as any;
    const service = new ResourcePreviewService({ update: jest.fn() } as any);

    await expect(service.resolveContentMetadata(
      ['copper', 'some-mod-item', '../invalid', 'ignored'],
      ['water-extractor'],
    )).resolves.toEqual({
      items: {
        copper: { name: '铜', icon: 'data:image/png;base64,Y29wcGVy' },
        'some-mod-item': { name: 'some-mod-item', icon: null },
        ignored: { name: 'ignored', icon: null },
      },
      blocks: { 'water-extractor': { name: '抽水机', icon: 'data:image/png;base64,d2F0ZXItZXh0cmFjdG9y' } },
      liquids: {},
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('/v1/content-metadata?');
    expect(decodeURIComponent(url)).toContain('items=copper,some-mod-item,ignored');
    expect(decodeURIComponent(url)).toContain('blocks=water-extractor');
    expect(options.headers).toEqual({ authorization: 'Bearer renderer-secret' });
  });

  it('returns an empty catalog if the renderer is not configured', async () => {
    delete process.env.RESOURCE_RENDERER_URL;
    const service = new ResourcePreviewService({ update: jest.fn() } as any);
    await expect(service.resolveContentMetadata(['copper'], ['battery']))
      .resolves.toEqual({ items: {}, blocks: {}, liquids: {} });
  });

  it('analyzes standalone editor files through the pinned renderer without persisting Resource metadata', async () => {
    process.env.RESOURCE_RENDERER_URL = 'http://127.0.0.1:6100';
    process.env.RESOURCE_RENDERER_TOKEN = 'renderer-secret';
    const source = Buffer.from([0x6d, 0x73, 0x63, 0x68, 1, 2, 3]);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ parserVersion: 'v160.5', metadata: {
        name: 'Local schematic', width: 8, height: 8, unknown_content: ['mod-block'],
        block_positions: [{ x: 1, y: 2, block: 'router', rotation: 0 }], ignored: 'not part of the safe metadata contract',
      } }),
    }) as any;
    const service = new ResourcePreviewService({ update: jest.fn() } as any);

    await expect(service.analyzeLocalEditorFile('schematic', '../local.msch', source)).resolves.toMatchObject({
      resource_kind: 'schematic', file_name: 'local.msch', parser_version: 'v160.5',
      sha256: crypto.createHash('sha256').update(source).digest('hex'),
      renderer_metadata: { name: 'Local schematic', width: 8, height: 8, unknown_content: ['mod-block'], block_positions: [{ x: 1, y: 2, block: 'router', rotation: 0 }] },
    });
    const [url, request] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('http://127.0.0.1:6100/v1/analyze');
    expect(request.headers).toEqual({ 'content-type': 'application/json', authorization: 'Bearer renderer-secret' });
    expect(JSON.parse(request.body)).toMatchObject({ filename: 'local.msch', resourceType: 'schematic', dataBase64: source.toString('base64') });
  });

  it('returns only validated vanilla entries and runtime rule defaults from the full content catalog', async () => {
    process.env.RESOURCE_RENDERER_URL = 'http://127.0.0.1:6100';
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({
      blocks: [{ internal_name: 'router', display_name: '路由器', icon: 'data:image/png;base64,AA==', size: 1, size_offset: 0, placeable: true, rotatable: true }],
      items: [], liquids: [], units: [], statuses: [],
      teams: [{ internal_name: 'sharded', display_name: '秩序', icon: null, id: 0 }],
      rule_defaults: { waveTimer: true, itemDepositCooldown: 0.5, unknown: 'drop me' },
    }) }) as any;
    const service = new ResourcePreviewService({ update: jest.fn() } as any);

    await expect(service.resolveContentCatalog()).resolves.toEqual({
      blocks: [{ internal_name: 'router', display_name: '路由器', icon: 'data:image/png;base64,AA==', size: 1, size_offset: 0, placeable: true, rotatable: true }],
      items: [], liquids: [], units: [], statuses: [],
      teams: [{ internal_name: 'sharded', display_name: '秩序', icon: null, id: 0 }],
      rule_defaults: { waveTimer: true, itemDepositCooldown: 0.5 },
    });
  });

  it('creates a blank official schematic and verifies the bytes returned by Renderer', async () => {
    process.env.RESOURCE_RENDERER_URL = 'http://127.0.0.1:6100';
    const output = Buffer.from([0x6d, 0x73, 0x63, 0x68, 1, 0]);
    const outputHash = crypto.createHash('sha256').update(output).digest('hex');
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ dataBase64: output.toString('base64'), sha256: outputHash }) }) as any;
    const service = new ResourcePreviewService({ update: jest.fn() } as any);

    await expect(service.createBlankEditorFile('schematic', 12, 7, '空白蓝图')).resolves.toEqual({ data: output, sha256: outputHash });
    const [url, request] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('http://127.0.0.1:6100/v1/create-schematic');
    expect(JSON.parse(request.body)).toEqual({ width: 12, height: 7, name: '空白蓝图' });
  });

  it('sends schematic edits to the official renderer and verifies its serialized bytes', async () => {
    const source = Buffer.from([0x6d, 0x73, 0x63, 0x68, 1, 2, 3]);
    const output = Buffer.from([0x6d, 0x73, 0x63, 0x68, 1, 4, 5]);
    const outputHash = crypto.createHash('sha256').update(output).digest('hex');
    process.env.RESOURCE_RENDERER_URL = 'http://127.0.0.1:6100';
    process.env.RESOURCE_RENDERER_TOKEN = 'renderer-secret';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ dataBase64: output.toString('base64'), sha256: outputHash }),
    }) as any;
    const service = new ResourcePreviewService({ update: jest.fn() } as any);

    await expect(service.transformSchematic('source.msch', source, {
      rotation_quarters: 1, mirror_x: true, delete_positions: [{ x: 3, y: 7 }],
    })).resolves.toEqual({ data: output, sha256: outputHash });

    const [url, request] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('http://127.0.0.1:6100/v2/transform-schematic');
    expect(request.headers).toEqual({ 'content-type': 'application/json', authorization: 'Bearer renderer-secret' });
    expect(JSON.parse(request.body)).toMatchObject({
      filename: 'source.msch',
      sha256: crypto.createHash('sha256').update(source).digest('hex'),
      dataBase64: source.toString('base64'),
      rotation_quarters: 1,
      mirror_x: true,
      delete_positions: [{ x: 3, y: 7 }],
      move_positions: [],
      add_blocks: [],
    });
  });

  it('rejects invalid editor coordinates and renderer output hashes', async () => {
    process.env.RESOURCE_RENDERER_URL = 'http://127.0.0.1:6100';
    const source = Buffer.from([0x6d, 0x73, 0x63, 0x68, 1, 2, 3]);
    global.fetch = jest.fn();
    const service = new ResourcePreviewService({ update: jest.fn() } as any);
    await expect(service.transformSchematic('source.msch', source, {
      rotation_quarters: 4, mirror_x: false, delete_positions: [],
    })).rejects.toThrow('蓝图编辑操作无效');
    expect(global.fetch).not.toHaveBeenCalled();

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ dataBase64: Buffer.from('not a schematic').toString('base64'), sha256: '0'.repeat(64) }),
    }) as any;
    await expect(service.transformSchematic('source.msch', source, {
      rotation_quarters: 0, mirror_x: false, delete_positions: [],
    })).rejects.toThrow('Mindustry 蓝图编辑器返回了无效结果');
  });

  it('persists generic upload drafts across service instances and binds them to the owner', async () => {
    let row: any = null;
    const uploadDrafts = {
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn(async (value: any) => { row = { ...value }; return row; }),
      findOne: jest.fn(async ({ where }: any) => row?.id === where.id && row?.user_id === where.user_id ? row : null),
      update: jest.fn(async (_where: any, value: any) => { row = { ...row, ...value }; return { affected: 1 }; }),
      delete: jest.fn(async (where: any) => {
        if (row?.id !== where.id || (where.user_id !== undefined && row.user_id !== where.user_id)) return { affected: 0 };
        row = null;
        return { affected: 1 };
      }),
    };
    const service = new ResourcePreviewService({ update: jest.fn() } as any, { removeManaged: jest.fn() } as any, uploadDrafts as any);
    const file = { file_path: '/private/quarantine/mod.zip', file_name: 'mod.zip', file_size: 12, mime_type: 'application/zip', content_hash: 'a'.repeat(64) };
    const draft = await service.createUploadDraft(17, 'mod', file);

    expect(uploadDrafts.save).toHaveBeenCalledWith(expect.objectContaining({ user_id: 17, resource_kind: 'mod', file_path: file.file_path, preview_key: null }));
    await expect(service.getDraft(18, draft.id)).rejects.toThrow('预览草稿不存在或已过期');
    await expect(service.updateDraft(17, draft.id, { title: 'Approved draft title' })).resolves.toMatchObject({ draft: { title: 'Approved draft title' } });
    await expect(service.consumeDraft(17, draft.id, 'mod')).resolves.toMatchObject({ file, previewKey: null });
    expect(uploadDrafts.delete).toHaveBeenCalled();
  });
});
