import { ResourceFile } from '@entities/resource-file.entity';
import { ResourceFileProviderService } from './resource-file-provider.service';

const file = (values: Partial<ResourceFile>): ResourceFile => ({
  storage_backend: 'res', delivery_mode: 'managed', provider_object_id: 'public-object',
  original_filename: '地图 #1.msav', display_name: null, storage_key: null,
  external_url: null, provider_file_id: null, ...values,
} as ResourceFile);

describe('ResourceFileProviderService', () => {
  const res = {
    buildPublicDownloadUrl: jest.fn().mockReturnValue('https://res.example/o/public-object/%E5%9C%B0%E5%9B%BE%20%231.msav'),
    createPrivateDownloadUrl: jest.fn().mockResolvedValue({ url: 'https://res.example/private/token', expires_at: '2030-01-01T00:00:00Z' }),
    getObjectContent: jest.fn().mockResolvedValue(Buffer.from('res')),
  };
  const managed = {
    statManagedFile: jest.fn().mockResolvedValue({ path: '/safe/file', size: 3 }),
    readManagedFile: jest.fn().mockResolvedValue(Buffer.from('old')),
  };
  const mfl = {
    resolveDownloadUrl: jest.fn().mockResolvedValue('https://file.example/d/resources/a%20b.msav'),
    getDownloadUrl: jest.fn().mockReturnValue('https://file.example/download/12'),
  };
  const provider = new ResourceFileProviderService(res as any, managed as any, mfl as any);

  beforeEach(() => jest.clearAllMocks());

  it('uses a public RES URL without a metadata request', async () => {
    await expect(provider.getDownloadTarget(file({}))).resolves.toEqual({ kind: 'redirect', url: 'https://res.example/o/public-object/%E5%9C%B0%E5%9B%BE%20%231.msav' });
    expect(res.buildPublicDownloadUrl).toHaveBeenCalledWith('public-object', '地图 #1.msav');
  });

  it('issues a short signed URL for a private RES file', async () => {
    await expect(provider.getDownloadTarget(file({}), { private: true })).resolves.toEqual({ kind: 'redirect', url: 'https://res.example/private/token' });
    expect(res.createPrivateDownloadUrl).toHaveBeenCalledWith('public-object', { filename: '地图 #1.msav', expires_in: 300 });
  });

  it('reads RES content through the authenticated service endpoint', async () => {
    await expect(provider.getReadableContent(file({}), 1024)).resolves.toEqual(Buffer.from('res'));
    expect(res.getObjectContent).toHaveBeenCalledWith('public-object', { maxBytes: 1024 });
  });

  it('keeps managed file validation in the local storage service', async () => {
    await expect(provider.getDownloadTarget(file({ storage_backend: 'managed', storage_key: '/safe/file' }))).resolves.toEqual({ kind: 'managed', path: '/safe/file', size: 3 });
    await expect(provider.getReadableContent(file({ storage_backend: 'managed', storage_key: '/safe/file' }), 1024)).resolves.toEqual(Buffer.from('old'));
  });

  it('resolves MFL download URLs from current file metadata', async () => {
    await expect(provider.getDownloadTarget(file({ storage_backend: 'mfl', provider_file_id: 12 }))).resolves.toEqual({ kind: 'redirect', url: 'https://file.example/d/resources/a%20b.msav' });
    expect(mfl.resolveDownloadUrl).toHaveBeenCalledWith(12);
  });

  it('validates external redirects', async () => {
    await expect(provider.getDownloadTarget(file({ storage_backend: 'external', external_url: 'javascript:alert(1)' }))).rejects.toThrow();
  });
});
