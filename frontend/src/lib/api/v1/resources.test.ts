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

import { getResourceV1 } from './resources';
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
          id: 1,
          title: 'Test Resource',
          summary: 'Sum',
          resource_kind: 'mod',
          visibility: 'public',
          download_count: 42,
          latest_version: null,
          attributions: [],
        },
        meta: { request_id: 'req-1' },
      }),
    } as Response);

    const result = await getResourceV1(1);

    expect(result.id).toBe(1);
    expect(result.title).toBe('Test Resource');
    expect(result.download_count).toBe(42);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    // The URL should hit the V1 namespace, routed through buildPublicApiUrl.
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/api/v1/resources/1');
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

    await expect(getResourceV1(999)).rejects.toThrow(V1ApiError);

    try {
      await getResourceV1(999);
    } catch (e) {
      const err = e as V1ApiError;
      expect(err).toBeInstanceOf(V1ApiError);
      expect(err.code).toBe('RESOURCE_NOT_FOUND');
      expect(err.status).toBe(404);
      expect(err.retryable).toBe(false);
    }
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

    await expect(getResourceV1(1)).rejects.toThrow(V1ApiError);

    try {
      await getResourceV1(1);
    } catch (e) {
      const err = e as V1ApiError;
      expect(err.code).toBe('HTTP_ERROR');
      expect(err.status).toBe(500);
      // 5xx is retryable by default when the body is unreadable.
      expect(err.retryable).toBe(true);
    }
  });
});
