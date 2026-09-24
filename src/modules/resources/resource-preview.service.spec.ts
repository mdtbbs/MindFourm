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
        metadata: { name: 'Alpha', width: 40, ignored: 'must not persist' },
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
      renderer_metadata_json: { name: 'Alpha', width: 40 },
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
      .resolves.toEqual({ items: {}, blocks: {} });
  });
});
