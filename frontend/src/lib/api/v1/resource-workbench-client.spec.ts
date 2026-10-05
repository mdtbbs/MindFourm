const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
(global as unknown as { fetch: typeof fetch }).fetch = mockFetch as unknown as typeof fetch;

import {
  analyzeResourceWorkbenchVersionV2,
  createResourceV2Relation,
  getResourceV2MapFeedback,
  getResourceV2ModCompatibility,
  getResourceV2ModIssueReports,
  getResourceV2VersionDiff,
  getResourceWorkbenchV2,
  submitResourceV2MapFeedback,
  submitResourceV2ModCompatibilityReport,
  submitResourceV2ModConflict,
  submitResourceV2ModIssueReport,
} from './resources';

describe('Resource Workbench V2 client', () => {
  beforeEach(() => mockFetch.mockReset());

  it('fetches the public-id workbench route and unwraps its V1 envelope', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          resource: { public_id: 'resource/id' },
          permissions: { role: 'viewer', can_manage: false },
          versions: [],
          analysis: null,
          relations: [],
          stats: { views: 0, downloads: 0, likes: 0, favorites: 0, rating_count: 0, rating_average: 0 },
        },
        meta: { request_id: 'req-workbench' },
      }),
    } as Response);

    const result = await getResourceWorkbenchV2('resource/id');

    expect(result.resource.public_id).toBe('resource/id');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toContain('/api/v1/resources/resource%2Fid/workbench');
  });

  it('sends release analysis as multipart without overriding the browser boundary', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          resource_public_id: 'resource-id',
          resource_kind: 'map',
          analysis: { parser_version: 'renderer-1', renderer_metadata: { width: 64, height: 32 }, duplicate: false, findings: [] },
        },
        meta: { request_id: 'req-analysis' },
      }),
    } as Response);

    const body = new FormData();
    body.append('file', new Blob(['map file']), 'base.msav');
    const result = await analyzeResourceWorkbenchVersionV2('resource-id', body);

    expect(result.analysis.parser_version).toBe('renderer-1');
    const [, request] = mockFetch.mock.calls[0];
    expect(request?.method).toBe('POST');
    expect(request?.body).toBe(body);
    expect((request?.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });

  it('fetches kind-specific diffs and paginated public issue reports', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { items: [], pagination: { next_cursor: null, has_more: false } }, meta: { request_id: 'req-read' } }),
    } as Response);

    await getResourceV2VersionDiff('map/id', 'map', 'version/id');
    await getResourceV2VersionDiff('schematic-id', 'schematic', 'version-id');
    await getResourceV2VersionDiff('mod-id', 'mod', 'version-id');
    await getResourceV2ModIssueReports('mod/id', { limit: 10, cursor: 'opaque cursor' });

    expect(mockFetch.mock.calls[0][0]).toContain('/api/v1/resources/maps/map%2Fid/diff?to_version_public_id=version%2Fid');
    expect(mockFetch.mock.calls[1][0]).toContain('/api/v1/resources/schematics/schematic-id/diff?to_version_public_id=version-id');
    expect(mockFetch.mock.calls[2][0]).toContain('/api/v1/resources/mods/mod-id/diff?to_version_public_id=version-id');
    expect(mockFetch.mock.calls[3][0]).toContain('/api/v1/resources/mods/mod%2Fid/issue-reports?limit=10&cursor=opaque+cursor');
  });

  it('uses the V2 community report, feedback, conflict, and relation routes', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { aggregate: { feedback_count: 1 } }, meta: { request_id: 'req-community' } }),
    } as Response);

    await getResourceV2ModCompatibility('mod/id', 'version/id');
    expect(mockFetch.mock.calls[0][0]).toContain('/api/v1/resources/mods/mod%2Fid/compatibility?version_public_id=version%2Fid');

    await submitResourceV2ModCompatibilityReport('mod-id', 'version-id', { status: 'working' });
    await submitResourceV2ModIssueReport('mod-id', 'version-id', { title: 'Issue', body: 'Details' });
    await submitResourceV2ModConflict({ members: [
      { resource_public_id: 'mod-id', version_public_id: 'version-id' },
      { resource_public_id: 'other-mod', version_public_id: 'other-version' },
    ] });
    await getResourceV2MapFeedback('map-id', 'map-version');
    await submitResourceV2MapFeedback('map-id', 'map-version', { difficulty: 4 });
    await createResourceV2Relation('map-id', {
      target_resource_public_id: 'schematic-id', relation_type: 'recommended_for', relation_context: 'production',
    });

    const calls = mockFetch.mock.calls;
    expect(calls[1][0]).toContain('/api/v1/resources/mods/mod-id/versions/version-id/compatibility-reports');
    expect(calls[2][0]).toContain('/api/v1/resources/mods/mod-id/versions/version-id/issue-reports');
    expect(calls[3][0]).toContain('/api/v1/resources/mods/conflicts');
    expect(calls[4][0]).toContain('/api/v1/resources/maps/map-id/versions/map-version/feedback');
    expect(calls[5][0]).toContain('/api/v1/resources/maps/map-id/versions/map-version/feedback');
    expect(calls[6][0]).toContain('/api/v1/resources/map-id/relations');
    expect(JSON.parse(String(calls[6][1]?.body))).toEqual({
      target_resource_public_id: 'schematic-id', relation_type: 'recommended_for', relation_context: 'production',
    });
  });
});
