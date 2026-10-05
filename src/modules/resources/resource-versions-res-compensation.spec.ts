import { ResourceFile } from '@entities/resource-file.entity';
import { ResourceStorageClientService } from './resource-storage-client.service';
import { ResourceVersionService } from './resource-versions.service';

const config = { get: (key: string) => ({
  'res.baseUrl': 'https://res.example.com',
  'res.apiKey': 'service-key',
  'res.enabled': true,
  'res.requestTimeoutMs': 100,
  'res.uploadTimeoutMs': 100,
})[key] };

function respond(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('ResourceVersionService RES delete compensation', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('never restores a public file binding when the Resource is explicitly private', async () => {
    const resource = {
      id: 7,
      user_id: 10,
      status: 'approved',
      is_public: 1,
      visibility: 'private',
      deleted_at: null,
    };
    const version = {
      id: 11,
      resource_id: 7,
      public_id: 'version-public',
      status: 'published',
      renderer_preview_object_id: null,
      renderer_preview_binding_id: null,
      file_path: null,
      content_hash: null,
    };
    const file = {
      id: 31,
      public_id: 'file-public',
      resource_version_id: 11,
      storage_backend: 'res',
      provider_object_id: 'object-public',
      provider_binding_id: 'binding-old',
      availability_status: 'available',
    };

    const fileRepository = {
      find: jest.fn().mockResolvedValue([file]),
      update: jest.fn().mockResolvedValue({}),
    };
    const versionRepository = {
      findOne: jest.fn().mockResolvedValue(version),
      delete: jest.fn().mockRejectedValue(new Error('database delete failed')),
      update: jest.fn().mockResolvedValue({}),
      manager: { getRepository: jest.fn((entity) => entity === ResourceFile ? fileRepository : fileRepository) },
    };
    const resourceRepository = { findOne: jest.fn().mockResolvedValue(resource) };
    const storageDataSource = {
      query: jest.fn().mockResolvedValue([{ status: 'approved', is_public: 1, visibility: 'private', deleted_at: null }]),
    };
    const resClient = new ResourceStorageClientService(config as any, storageDataSource as any);

    const fetchMock = jest.fn()
      .mockResolvedValueOnce(respond(null, 204))
      .mockResolvedValueOnce(respond({
        binding: {
          id: 'binding-restored',
          object_id: 'object-public',
          namespace: 'mindforum',
          owner_type: 'resource_file',
          owner_id: 'file-public',
          visibility: 'private',
          created_at: '',
        },
      }, 201));
    global.fetch = fetchMock;

    const service = new ResourceVersionService(
      versionRepository as any,
      resourceRepository as any,
      { releaseContentHashClaim: jest.fn() } as any,
      {} as any,
      undefined,
      resClient,
      undefined,
    );

    await expect(service.delete(11, 7, 10)).rejects.toThrow('database delete failed');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      owner_type: 'resource_file',
      owner_id: 'file-public',
      visibility: 'private',
    });
    expect(fileRepository.update).toHaveBeenCalledWith(31, { provider_binding_id: 'binding-restored' });
  });
});
