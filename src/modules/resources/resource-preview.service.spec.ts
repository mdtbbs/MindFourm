import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { ResourcePreviewService } from './resource-preview.service';

describe('ResourcePreviewService', () => {
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
    const service = new ResourcePreviewService({ update: jest.fn() } as any, { removeManaged: jest.fn() } as any);

    const draft = await service.createDraft(17, 'schematic', {
      file_name: 'blueprint.msch', file_path: source, file_size: input.length,
      mime_type: 'application/octet-stream', content_hash: hash,
    });

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
    const service = new ResourcePreviewService({ update: jest.fn() } as any);
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
    expect(url).toBe('http://127.0.0.1:6100/v1/transform-schematic');
    expect(request.headers).toEqual({ 'content-type': 'application/json', authorization: 'Bearer renderer-secret' });
    expect(JSON.parse(request.body)).toMatchObject({
      filename: 'source.msch',
      sha256: crypto.createHash('sha256').update(source).digest('hex'),
      dataBase64: source.toString('base64'),
      rotation_quarters: 1,
      mirror_x: true,
      delete_positions: [{ x: 3, y: 7 }],
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
