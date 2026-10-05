import { ConfigService } from '@nestjs/config';
import { MflClientService } from './mfl-client.service';

describe('MflClientService download compatibility', () => {
  const config = { get: (key: string) => key === 'mfl.baseUrl' ? 'https://file.example' : key === 'mfl.apiKey' ? 'service-key' : undefined } as ConfigService;
  const client = new MflClientService(config);
  const originalFetch = global.fetch;

  afterEach(() => { global.fetch = originalFetch; });

  it('uses download-site /d/* path encoding when file_path is known', () => {
    expect(client.getDownloadUrl(12, 'resources/地图 #1.msav')).toBe('https://file.example/d/resources/%E5%9C%B0%E5%9B%BE%20%231.msav');
  });

  it('fetches authenticated metadata to resolve a historical file ID', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { file: { id: 12, file_path: 'resources/a b.msav' } } }) }) as any;
    await expect(client.resolveDownloadUrl(12)).resolves.toBe('https://file.example/d/resources/a%20b.msav');
    expect(global.fetch).toHaveBeenCalledWith('https://file.example/api/v1/files/12', expect.objectContaining({ headers: { Authorization: 'Bearer service-key' }, signal: expect.any(AbortSignal) }));
  });
});
