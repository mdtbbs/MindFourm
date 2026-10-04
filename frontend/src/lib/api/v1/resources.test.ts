/**
 * @jest-environment node
 *
 * Unit tests for the V1 Resources API client.
 *
 * The frontend does not currently ship a Jest config, so these tests
 * exist as documentation of the contract between `getResourceV1` and
 * the transport layer. They can be executed once a Jest setup is added
 * (or by copying them into a project that has one). The production
 * code is verified via `tsc --noEmit` in CI.
 */

const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
(global as unknown as { fetch: typeof fetch }).fetch = mockFetch as unknown as typeof fetch;

import {
  getResourceV1,
  getResourceWorkbenchV2Analysis,
  getResourceWorkbenchV2KindTabData,
  getResourceWorkbenchV2ModIndex,
  type ResourceWorkbenchV2Kind,
  type ResourceWorkbenchV2KindTab,
} from './resources';
import { V1ApiError } from './transport';

describe('V1 Resources API', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('unwraps the V1 response envelope and returns the data payload', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          public_id: 'abc',
          title: 'Test Resource',
          summary: 'Sum',
          resource_kind: 'mod',
          visibility: 'public',
          download_count: 42,
          metadata: {
            schema_version: 1,
            tags: [],
            supported_versions: [],
            compatibility: [],
            preview: { url: null, status: 'none' },
          },
          latest_version: null,
          attributions: [],
        },
        meta: { request_id: 'req-1' },
      }),
    } as Response);

    const result = await getResourceV1('abc');

    expect(result.public_id).toBe('abc');
    expect(result.title).toBe('Test Resource');
    expect(result.download_count).toBe(42);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    // The URL should hit the V1 namespace, routed through buildPublicApiUrl.
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/api/v1/resources/abc');
  });

  it('throws a typed V1ApiError on structured error responses', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: '资源不存在',
          retryable: false,
          details: [],
        },
        meta: { request_id: 'req-2' },
      }),
    } as Response);

    await expect(getResourceV1('missing')).rejects.toThrow(V1ApiError);

    try {
      await getResourceV1('missing');
    } catch (e) {
      const err = e as V1ApiError;
      expect(err).toBeInstanceOf(V1ApiError);
      expect(err.code).toBe('RESOURCE_NOT_FOUND');
      expect(err.status).toBe(404);
      expect(err.retryable).toBe(false);
    }
  });

  it('requests analysis for the selected Mod, map, or schematic version', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: { analysis: { kind: 'schematic', status: 'completed', parser_version: 'parser-1', started_at: null, completed_at: null, summary: null, findings: [], data: { available: true } } },
        meta: { request_id: 'req-analysis' },
      }),
    } as Response);

    const result = await getResourceWorkbenchV2Analysis('resource-id', 'schematic', 'version-id');

    expect(result?.kind).toBe('schematic');
    expect(result?.data).toEqual({ available: true });
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/api/v1/resources/schematics/resource-id/analysis?version_public_id=version-id');
  });

  it('requests Mod Content and localization pages for the selected version', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { items: [], pagination: { next_cursor: null, has_more: false } }, meta: { request_id: 'req-index' } }),
    } as Response);

    const result = await getResourceWorkbenchV2ModIndex('resource-id', 'version-id');

    expect(result.contents.items).toEqual([]);
    expect(result.localizations.items).toEqual([]);
    const requestedUrls = mockFetch.mock.calls.map(([url]) => url as string);
    expect(requestedUrls).toHaveLength(2);
    expect(requestedUrls.some((url) => url.includes('/api/v1/resources/mods/resource-id/contents?version_public_id=version-id&limit=100'))).toBe(true);
    expect(requestedUrls.some((url) => url.includes('/api/v1/resources/mods/resource-id/localizations?version_public_id=version-id&limit=100'))).toBe(true);
  });

  it.each([
    ['map', 'rules', '/resources/maps/resource-id/rules'],
    ['map', 'resources', '/resources/maps/resource-id/resources'],
    ['map', 'spawns', '/resources/maps/resource-id/spawns'],
    ['map', 'cores', '/resources/maps/resource-id'],
    ['map', 'waves', '/resources/maps/resource-id/waves'],
    ['schematic', 'blocks', '/resources/schematics/resource-id/blocks'],
    ['schematic', 'materials', '/resources/schematics/resource-id/materials'],
    ['schematic', 'production', '/resources/schematics/resource-id/production'],
    ['schematic', 'logic', '/resources/schematics/resource-id/logic'],
  ] as Array<[ResourceWorkbenchV2Kind, ResourceWorkbenchV2KindTab, string]>)('requests version-scoped %s %s data', async (kind, tab, route) => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { items: [], pagination: { next_cursor: null, has_more: false } }, meta: { request_id: 'req-kind-data' } }),
    } as Response);

    await getResourceWorkbenchV2KindTabData('resource-id', kind, tab, 'version-id', 'cursor-token');

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain(`/api/v1${route}?version_public_id=version-id&limit=100&cursor=cursor-token`);
  });

  it('normalizes map rules, map cores, and schematic production responses', async () => {
    const payloads: Record<string, unknown>[] = [
      { rules: { wave_team: 'attack', lighting: true } },
      { map: { width: 80, height: 50, cores: [{ team: 'sharded', x: 12, y: 18 }] } },
      { available: true, production: { estimated: true, items: { graphite: { produced: 6, consumed: 4, net: 2 } } } },
    ];
    mockFetch.mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: payloads.shift(), meta: { request_id: 'req-kind-data' } }),
    } as Response));

    const rules = await getResourceWorkbenchV2KindTabData('resource-id', 'map', 'rules', 'version-id');
    expect(rules.summary).toEqual({ wave_team: 'attack', lighting: true });
    const cores = await getResourceWorkbenchV2KindTabData('resource-id', 'map', 'cores', 'version-id');
    expect(cores.summary).toEqual({ width: 80, height: 50 });
    expect(cores.items).toEqual([{ team: 'sharded', x: 12, y: 18 }]);
    const production = await getResourceWorkbenchV2KindTabData('resource-id', 'schematic', 'production', 'version-id');
    expect(production.summary).toEqual({ estimated: true, items: { graphite: { produced: 6, consumed: 4, net: 2 } }, available: true });
  });

  it('falls back to a generic V1ApiError when the error body is not JSON', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => {
        throw new Error('not json');
      },
    } as unknown as Response);

    await expect(getResourceV1('abc')).rejects.toThrow(V1ApiError);

    try {
      await getResourceV1('abc');
    } catch (e) {
      const err = e as V1ApiError;
      expect(err.code).toBe('HTTP_ERROR');
      expect(err.status).toBe(500);
      // 5xx is retryable by default when the body is unreadable.
      expect(err.retryable).toBe(true);
    }
  });
});
