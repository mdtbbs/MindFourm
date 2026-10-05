import { ResourceStorageClientError, ResourceStorageClientService } from './resource-storage-client.service';

const object = { id: 'uuid', public_id: 'pub_123', sha256: 'a'.repeat(64), size_bytes: 3, mime_type: 'image/png', original_filename: '图.png', state: 'verified', created_at: '', verified_at: '' };
const config = { get: (key: string) => ({ 'res.baseUrl': 'https://res.example.com/', 'res.apiKey': 'private-service-key', 'res.enabled': true, 'res.requestTimeoutMs': 100, 'res.uploadTimeoutMs': 100 })[key] };

function respond(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('ResourceStorageClientService', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;
  let client: ResourceStorageClientService;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    client = new ResourceStorageClientService(config as any);
  });
  afterEach(() => { global.fetch = originalFetch; });

  it('creates direct upload sessions and accepts both deduplicated and token responses', async () => {
    fetchMock.mockResolvedValueOnce(respond({ deduplicated: true, object }))
      .mockResolvedValueOnce(respond({ deduplicated: false, upload: { session_id: 'session', url: 'https://res.example.com/upload/session', token: 'short-token', expires_at: '2026-10-05T23:59:00Z' } }, 201));
    const input = { sha256: 'a'.repeat(64), size_bytes: 3, mime_type: 'image/png', original_filename: '图.png', purpose: 'resource_version' };
    expect((await client.createUploadSession(input)).deduplicated).toBe(true);
    expect((await client.createUploadSession(input)).deduplicated).toBe(false);
    expect(fetchMock.mock.calls[0][0]).toBe('https://res.example.com/api/v1/uploads');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer private-service-key');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(input);
  });

  it('gets authoritative metadata, creates and deletes bindings, and signs private URLs', async () => {
    const binding = { id: 'binding-1', object_id: object.id, namespace: 'mindforum', owner_type: 'resource_file', owner_id: 'file-1', visibility: 'private', created_at: '' };
    fetchMock.mockResolvedValueOnce(respond({ object }))
      .mockResolvedValueOnce(respond({ binding }))
      .mockResolvedValueOnce(respond(null, 204))
      .mockResolvedValueOnce(respond({ url: 'https://res.example.com/private/token', expires_at: '2026-10-05T23:59:00Z' }, 201));
    expect(await client.getObject(object.public_id)).toEqual(object);
    expect(await client.createBinding(object.public_id, { namespace: 'mindforum', owner_type: 'resource_file', owner_id: 'file-1', visibility: 'private' })).toEqual(binding);
    await client.deleteBinding(object.public_id, binding.id);
    expect(await client.createPrivateDownloadUrl(object.public_id, { filename: '图.png', expires_in: 300 })).toHaveProperty('url');
    expect(fetchMock.mock.calls[2][1].method).toBe('DELETE');
  });

  it('downgrades a requested public file binding when the owning resource is private', async () => {
    const dataSource = { query: jest.fn().mockResolvedValue([{ status: 'approved', is_public: 1, visibility: 'private', deleted_at: null }]) };
    const guarded = new ResourceStorageClientService(config as any, dataSource as any);
    const binding = { id: 'binding-private', object_id: object.id, namespace: 'mindforum', owner_type: 'resource_file', owner_id: 'file-private', visibility: 'private', created_at: '' };
    fetchMock.mockResolvedValueOnce(respond({ binding }));
    await expect(guarded.createBinding(object.public_id, {
      namespace: 'mindforum', owner_type: 'resource_file', owner_id: 'file-private', visibility: 'public',
    })).resolves.toEqual(binding);
    expect(dataSource.query).toHaveBeenCalledWith(expect.stringContaining('r.visibility'), ['file-private']);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ owner_id: 'file-private', visibility: 'private' });
  });

  it('keeps public binding requests public for a visible approved resource', async () => {
    const dataSource = { query: jest.fn().mockResolvedValue([{ status: 'approved', is_public: 1, visibility: 'public', deleted_at: null }]) };
    const guarded = new ResourceStorageClientService(config as any, dataSource as any);
    const binding = { id: 'binding-public', object_id: object.id, namespace: 'mindforum', owner_type: 'resource_file', owner_id: 'file-public', visibility: 'public', created_at: '' };
    fetchMock.mockResolvedValueOnce(respond({ binding }));
    await expect(guarded.createBinding(object.public_id, {
      namespace: 'mindforum', owner_type: 'resource_file', owner_id: 'file-public', visibility: 'public',
    })).resolves.toEqual(binding);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ owner_id: 'file-public', visibility: 'public' });
  });

  it('encodes public download path components', () => {
    expect(client.buildPublicDownloadUrl('public/id', '图 #1.png')).toBe('https://res.example.com/o/public%2Fid/%E5%9B%BE%20%231.png');
  });

  it('maps 401, 403, and missing objects without including the key in errors', async () => {
    for (const status of [401, 403, 404]) {
      fetchMock.mockResolvedValueOnce(respond({ message: 'private-service-key' }, status));
      await expect(client.getObject('missing')).rejects.toMatchObject({ upstreamStatus: status, code: status === 404 ? 'not_found' : 'unauthorized' });
    }
    expect(new ResourceStorageClientError('unavailable').message).not.toContain('private-service-key');
  });

  it('maps network failures and disabled configuration to unavailable', async () => {
    fetchMock.mockRejectedValueOnce(new Error('aborted'));
    await expect(client.getObject('id')).rejects.toMatchObject({ code: 'unavailable' });
    const disabled = new ResourceStorageClientService({ get: (key: string) => key === 'res.enabled' ? false : config.get(key) } as any);
    await expect(disabled.createUploadSession({ size_bytes: 1, mime_type: 'image/png', original_filename: 'x.png', purpose: 'resource_version' })).rejects.toMatchObject({ code: 'unavailable' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('times out an unresponsive upstream request', async () => {
    const fast = new ResourceStorageClientService({ get: (key: string) => key === 'res.requestTimeoutMs' ? 5 : config.get(key) } as any);
    fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));
    await expect(fast.getObject('id')).rejects.toMatchObject({ code: 'timeout' });
  });

  it('uploads generated bytes and verifies the resulting metadata', async () => {
    const body = Buffer.from('abc');
    const hashed = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
    fetchMock.mockResolvedValueOnce(respond({ deduplicated: false, upload: { session_id: 'session', url: 'https://res.example.com/upload/session', token: 'short-token', expires_at: '2026-10-05T23:59:00Z' } }, 201))
      .mockResolvedValueOnce(respond({ object: { public_id: object.public_id } }, 201))
      .mockResolvedValueOnce(respond({ object: { ...object, sha256: hashed } }));
    expect(await client.uploadServerGeneratedObject({ body, sizeBytes: 3, mimeType: 'image/png', filename: '图.png', purpose: 'preview' })).toMatchObject({ public_id: object.public_id });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).sha256).toBe(hashed);
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer short-token');
  });

  it('reuses a verified deduplicated object without uploading bytes', async () => {
    const body = Buffer.from('abc');
    const sha256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
    fetchMock.mockResolvedValueOnce(respond({ deduplicated: true, object: { ...object, sha256 } }))
      .mockResolvedValueOnce(respond({ object: { ...object, sha256 } }));
    expect(await client.uploadServerGeneratedObject({ body, sizeBytes: 3, mimeType: 'image/png', filename: '图.png', purpose: 'preview' })).toMatchObject({ public_id: object.public_id });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('sanitizes malformed JSON and rejects signed redirects outside RES', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => { throw new Error('private-service-key upstream payload'); } });
    await expect(client.getObject('object')).rejects.toMatchObject({ code: 'rejected', message: expect.not.stringContaining('private-service-key') });
    fetchMock.mockResolvedValueOnce(respond({ url: 'https://other.example/private/token', expires_at: '2026-10-05T23:59:00Z' }));
    await expect(client.createPrivateDownloadUrl('object')).rejects.toMatchObject({ code: 'rejected' });
  });

});
