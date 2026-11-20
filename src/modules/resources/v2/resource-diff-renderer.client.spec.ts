import { ResourceDiffRendererClient, ResourceDiffRendererError } from './resource-diff-renderer.client';

const SHA = 'a'.repeat(64);
const input = { data: Buffer.from('msch-data'), sha256: SHA };

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) } as any;
}

describe('ResourceDiffRendererClient', () => {
  const originalUrl = process.env.RESOURCE_RENDERER_URL;
  const originalToken = process.env.RESOURCE_RENDERER_TOKEN;
  beforeEach(() => { process.env.RESOURCE_RENDERER_URL = 'http://127.0.0.1:6100'; delete process.env.RESOURCE_RENDERER_TOKEN; });
  afterEach(() => {
    if (originalUrl === undefined) delete process.env.RESOURCE_RENDERER_URL; else process.env.RESOURCE_RENDERER_URL = originalUrl;
    if (originalToken === undefined) delete process.env.RESOURCE_RENDERER_TOKEN; else process.env.RESOURCE_RENDERER_TOKEN = originalToken;
    jest.restoreAllMocks();
  });

  it('posts both sources with hashes and validates a full schematic diff', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({
      schemaVersion: 2, mode: 'full', fallbackReason: null, unknownContent: [], diffOverlayKey: null,
      diff: { schema_version: 2, mode: 'full', kind: 'schematic' },
    }));
    const client = new ResourceDiffRendererClient();
    const result = await client.compareSchematic(input, input, { x: 2, y: -3 });
    expect(result.mode).toBe('full');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:6100/v2/schematic-diff');
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ fromSha256: SHA, toSha256: SHA, offset_x: 2, offset_y: -3, fromBase64: Buffer.from('msch-data').toString('base64') });
  });

  it('marks modded failures instead of treating them as a generic error', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({ errorCode: 'UNSUPPORTED_MOD_CONTENT' }, 422));
    const client = new ResourceDiffRendererClient();
    await expect(client.compareMap(input, input)).rejects.toMatchObject({ code: 'UNSUPPORTED_MOD_CONTENT', modded: true });
  });

  it('drops an overlay key outside the controlled preview namespace', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({
      schemaVersion: 2, mode: 'full', fallbackReason: null, unknownContent: [],
      diffOverlayKey: '../../../etc/passwd', diff: { schema_version: 2, mode: 'full', kind: 'map' },
    }));
    const client = new ResourceDiffRendererClient();
    const result = await client.compareMap(input, input);
    expect(result.diffOverlayKey).toBeNull();
  });

  it('fails closed when the renderer is not configured or returns an invalid shape', async () => {
    delete process.env.RESOURCE_RENDERER_URL;
    const client = new ResourceDiffRendererClient();
    await expect(client.compareSchematic(input, input)).rejects.toMatchObject({ code: 'RENDERER_NOT_CONFIGURED' });

    process.env.RESOURCE_RENDERER_URL = 'http://127.0.0.1:6100';
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({ schemaVersion: 2, mode: 'full' }));
    await expect(client.compareSchematic(input, input)).rejects.toBeInstanceOf(ResourceDiffRendererError);
  });

  it('requests a bounded 128x128 chunk', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({
      schemaVersion: 2, mode: 'full', fallbackReason: null,
      chunk: { cx: 2, cy: 3, tileWidth: 128, tileHeight: 128, floorChanged: true, overlayChanged: false, floorRuns: [], overlayRuns: [], truncated: false },
    }));
    const client = new ResourceDiffRendererClient();
    const result = await client.mapChunk(input, input, 2, 3);
    expect(result.chunk).toMatchObject({ cx: 2, cy: 3 });
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body).toMatchObject({ cx: 2, cy: 3 });
  });
});
