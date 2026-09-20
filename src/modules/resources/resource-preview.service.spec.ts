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
});
