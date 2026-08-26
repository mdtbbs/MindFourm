import { friendsApi, resetApiCache } from '../../../frontend/src/lib/api/client';

const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
(global as unknown as { fetch: typeof fetch }).fetch = mockFetch as unknown as typeof fetch;

describe('friendsApi response contract', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    resetApiCache();
  });

  it('unwraps a search response to a user array', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: [{ id: 2, username: 'test', avatar_url: null }],
      }),
    } as Response);

    await expect(friendsApi.search('test')).resolves.toEqual([
      { id: 2, username: 'test', avatar_url: null },
    ]);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/friends/search?q=test&limit=10'),
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('uses the request endpoint and unwraps its mutation response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { message: '好友请求已发送' } }),
    } as Response);

    await expect(friendsApi.sendRequest(2)).resolves.toEqual({ message: '好友请求已发送' });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/friends/request/2'),
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });
});
