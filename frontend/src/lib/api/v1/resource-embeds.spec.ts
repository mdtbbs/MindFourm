/**
 * Card hydration is shared state: cards rendered in one commit must produce one
 * request, results are cached briefly, and a failed request must stay retryable.
 */
jest.mock('./transport', () => ({ fetchV1: jest.fn() }));
jest.mock('./resource-direct-upload', () => ({
  createResourceDirectUploadDraft: jest.fn(),
  uploadResourceDirectDraft: jest.fn(),
}));

import { fetchV1 } from './transport';
import {
  clearResourceEmbedCache,
  loadResourceEmbedCard,
  type ResourceEmbedCard,
} from './resource-embeds';

const mockFetch = fetchV1 as jest.MockedFunction<typeof fetchV1>;
const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';

function card(id: string, overrides: Partial<ResourceEmbedCard> = {}): ResourceEmbedCard {
  return {
    resource_public_id: id,
    version_public_id: null,
    status: 'available',
    resource_kind: 'schematic',
    title: `Resource ${id.slice(0, 4)}`,
    summary: null,
    url: `/resources/${id}`,
    preview_url: null,
    download_url: null,
    author: null,
    version: '1.0',
    schematic: null,
    map: null,
    reason: null,
    ...overrides,
  };
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('resource embed hydration', () => {
  beforeEach(() => {
    clearResourceEmbedCache();
    mockFetch.mockReset();
  });

  it('merges cards requested in the same tick into one batch', async () => {
    mockFetch.mockResolvedValue({ items: [card(ID_A), card(ID_B)] } as never);
    const first = loadResourceEmbedCard(ID_A);
    const second = loadResourceEmbedCard(ID_B);
    await settle();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const path = String(mockFetch.mock.calls[0][0]);
    expect(path).toContain(`ids=${ID_A},${ID_B}`);
    await expect(first).resolves.toMatchObject({ resource_public_id: ID_A, status: 'available' });
    await expect(second).resolves.toMatchObject({ resource_public_id: ID_B, status: 'available' });
  });

  it('serves a repeat read from the short-lived cache', async () => {
    mockFetch.mockResolvedValue({ items: [card(ID_A)] } as never);
    await loadResourceEmbedCard(ID_A);
    await settle();
    await expect(loadResourceEmbedCard(ID_A)).resolves.toMatchObject({ resource_public_id: ID_A });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failure and allows the next read to retry', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network down'));
    await expect(loadResourceEmbedCard(ID_A)).rejects.toThrow('network down');
    mockFetch.mockResolvedValueOnce({ items: [card(ID_A)] } as never);
    await expect(loadResourceEmbedCard(ID_A)).resolves.toMatchObject({ status: 'available' });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('turns unavailable rows into a fieldless placeholder', async () => {
    mockFetch.mockResolvedValue({
      items: [card(ID_A, {
        status: 'unavailable',
        title: 'Leaked title',
        preview_url: '/leaked.png',
        url: '/resources/leaked',
        download_url: '/api/v1/leaked',
        author: { id: 1, username: 'leak', avatar_url: null },
      })],
    } as never);
    const result = await loadResourceEmbedCard(ID_A);
    expect(result).toMatchObject({
      status: 'unavailable',
      title: null,
      preview_url: null,
      url: null,
      download_url: null,
      author: null,
    });
  });

  it('treats an unknown status and a missing item as unavailable', async () => {
    mockFetch.mockResolvedValueOnce({
      items: [card(ID_A, { status: 'mystery' as never, title: 'Hidden' })],
    } as never);
    await expect(loadResourceEmbedCard(ID_A)).resolves.toMatchObject({ status: 'unavailable', title: null });
    clearResourceEmbedCache();
    mockFetch.mockResolvedValueOnce({ items: [card(ID_B)] } as never);
    await expect(loadResourceEmbedCard(ID_A)).resolves.toMatchObject({ status: 'unavailable', reason: 'not_found' });
  });

  it('never sends a malformed id to the network', async () => {
    await expect(loadResourceEmbedCard('not-a-uuid')).resolves.toMatchObject({ status: 'unavailable' });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
