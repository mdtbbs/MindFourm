/**
 * @jest-environment node
 *
 * Contract tests for the public visual-diff and logic-search client. Every
 * identifier/filter is user-controlled, so the URL assertions here are the
 * boundary that keeps raw values out of the query string.
 */

const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
(global as unknown as { fetch: typeof fetch }).fetch = mockFetch as unknown as typeof fetch;

import {
  getMapDiffChunk,
  getMapDiffOverlayBlob,
  getMapDiffOverlayUrl,
  getResourceVisualDiff,
  searchSchematicLogic,
} from './resource-visual-diff';

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status >= 200 && status < 300 ? 'OK' : 'Error',
    json: async () => ({ data, meta: { request_id: 'req-visual-diff' } }),
  } as unknown as Response;
}

function calledUrl(call = 0): string {
  return mockFetch.mock.calls[call][0] as string;
}

describe('visual diff API client', () => {
  beforeEach(() => mockFetch.mockReset());

  it('encodes both version ids and parses a 202 computing payload as success', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      from_version_public_id: 'from/id',
      to_version_public_id: 'to id',
      status: 'computing',
      parser_version: null,
      diff: null,
      retry_after_ms: 1500,
    }, 202));

    const result = await getResourceVisualDiff('res/id', 'schematic', {
      fromVersionPublicId: 'from/id',
      toVersionPublicId: 'to id',
    });

    expect(result.status).toBe('computing');
    expect(result.retry_after_ms).toBe(1500);
    expect(calledUrl()).toContain('/api/v1/resources/schematics/res%2Fid/diff?from_version_public_id=from%2Fid&to_version_public_id=to%20id');
  });

  it('uses the maps route and omits an absent from-version', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      from_version_public_id: null,
      to_version_public_id: 'v2',
      status: 'completed',
      parser_version: 'p1',
      diff: { mode: 'full', kind: 'map' },
    }));

    await getResourceVisualDiff('map id', 'map', { toVersionPublicId: 'v2' });

    const url = calledUrl();
    expect(url).toContain('/api/v1/resources/maps/map%20id/diff?to_version_public_id=v2');
    expect(url).not.toContain('from_version_public_id');
  });

  it('requests a chunk with encoded ids and bounded integer coordinates', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      from_version_public_id: 'f1',
      to_version_public_id: 't2',
      cx: 3,
      cy: -2,
      status: 'ready',
      chunk: { cx: 3, cy: 0, tileWidth: 128, tileHeight: 128, floorRuns: [], overlayRuns: [], truncated: false },
    }));

    const result = await getMapDiffChunk('map/id', {
      fromVersionPublicId: 'f/1',
      toVersionPublicId: 't 2',
      cx: 3,
      cy: -2.9,
    });

    expect(result.status).toBe('ready');
    expect(calledUrl()).toContain('/api/v1/resources/maps/map%2Fid/diff/chunk?from_version_public_id=f%2F1&to_version_public_id=t%202&cx=3&cy=0');
    expect(result.chunk?.tileWidth).toBe(128);
  });

  it('builds a relative same-origin overlay URL', () => {
    expect(getMapDiffOverlayUrl('ma/p', {
      fromVersionPublicId: 'a b',
      toVersionPublicId: 'c/d',
    })).toBe('/api/v1/resources/maps/ma%2Fp/diff/overlay?from_version_public_id=a%20b&to_version_public_id=c%2Fd');
  });

  it('fetches overlay bytes through the blob transport', async () => {
    const blob = new Blob(['png'], { type: 'image/png' });
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      blob: async () => blob,
    } as unknown as Response);

    const result = await getMapDiffOverlayBlob('m/id', { toVersionPublicId: 't/v' });

    expect(result).toBe(blob);
    expect(calledUrl()).toContain('/api/v1/resources/maps/m%2Fid/diff/overlay?to_version_public_id=t%2Fv');
    const init = mockFetch.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>).Accept).toBe('application/octet-stream');
  });

  it('trims and encodes every logic-search filter', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ items: [], pagination: { next_cursor: null, has_more: false } }));

    await searchSchematicLogic({
      q: '  walk 1  ',
      opcode: ' sensor ',
      unit: 'flare',
      processorType: 'micro-processor',
      cursor: 'a b',
      limit: 20,
    });

    expect(calledUrl()).toContain('/api/v1/resources/schematics/logic-search?q=walk%201&opcode=sensor&unit=flare&processor_type=micro-processor&cursor=a%20b&limit=20');
  });

  it('bounds long filters and drops blank ones', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ items: [], pagination: { next_cursor: null, has_more: false } }));

    await searchSchematicLogic({
      q: 'q'.repeat(300),
      opcode: 'o'.repeat(80),
      unit: 'u'.repeat(80),
      processorType: 'p'.repeat(80),
      cursor: '',
      limit: 999,
    });

    const url = calledUrl();
    expect(url).toContain(`q=${'q'.repeat(200)}`);
    expect(url).toContain(`opcode=${'o'.repeat(50)}`);
    expect(url).toContain(`unit=${'u'.repeat(50)}`);
    expect(url).toContain(`processor_type=${'p'.repeat(64)}`);
    expect(url).toContain('limit=50');
    expect(url).not.toContain('cursor=');
  });

  it('leaves a blank query off the URL entirely', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ items: [], pagination: { next_cursor: 'next', has_more: true } }));

    const result = await searchSchematicLogic({ q: '   ', limit: 1 });

    expect(calledUrl()).toContain('/api/v1/resources/schematics/logic-search?limit=1');
    expect(result.pagination.next_cursor).toBe('next');
  });
});
