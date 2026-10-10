import { BlobsController } from './blobs.controller';
import { BlobStorageError } from './blob-storage.service';

function response() {
  const headers: Record<string, string> = {};
  const body: any = { status: undefined, json: undefined };
  const res: any = {
    headers, body,
    status(code: number) { body.status = code; return res; },
    json(payload: unknown) { body.json = payload; return res; },
    setHeader(name: string, value: string) { headers[name] = value; return res; },
    end() { return res; },
    destroy() { return res; },
  };
  return res;
}

function controller(overrides: Record<string, jest.Mock> = {}) {
  const blobs = {
    usage: jest.fn(async () => ({ used_bytes: 0, limit_bytes: 1, max_object_bytes: 1, blob_count: 0 })),
    listBlobs: jest.fn(async () => []),
    createUpload: jest.fn(async () => ({ upload_id: 'upload-1', deduplicated: false, commit_required: true })),
    receiveUpload: jest.fn(async () => ({ upload_id: 'upload-1', uploaded: true, size_bytes: 4, sha256: 'a'.repeat(64) })),
    commitUpload: jest.fn(async () => ({ blob: {}, committed: true })),
    cancelUpload: jest.fn(async () => ({ id: 'upload-1', cancelled: true })),
    getBlob: jest.fn(async () => ({ id: 'blob-1' })),
    openBlobContent: jest.fn(async () => ({
      stream: { on: jest.fn(), pipe: jest.fn() }, size: 4, last_modified: new Date('2026-01-01T00:00:00Z'),
      row: { file_name: 'note.txt', mime_type: 'text/html', sha256: 'a'.repeat(64) },
    })),
    deleteBlob: jest.fn(async () => ({ id: 'blob-1', deleted: true })),
    updateBlob: jest.fn(async () => ({ id: 'blob-1' })),
    ...overrides,
  };
  return { blobs, instance: new BlobsController(blobs as any) };
}

describe('BlobsController content responses', () => {
  it('serves a non-whitelisted declared type as an octet-stream attachment', async () => {
    const { instance } = controller();
    const res = response();

    await instance.content({ user: { id: 17 } } as any, res, 'blob-1');

    // The uploader declared text/html; the browser must not be allowed to render it.
    expect(res.headers['Content-Type']).toBe('application/octet-stream');
    expect(res.headers['Content-Disposition']).toContain('attachment;');
    expect(res.headers['X-Content-Type-Options']).toBe('nosniff');
    expect(res.headers['Cache-Control']).toContain('private');
    expect(res.headers['ETag']).toBe(`"sha256-${'a'.repeat(64)}"`);
  });

  it('renders only whitelisted media types inline', async () => {
    const { instance } = controller({
      openBlobContent: jest.fn(async () => ({
        stream: { on: jest.fn(), pipe: jest.fn() }, size: 4, last_modified: new Date(),
        row: { file_name: 'photo.png', mime_type: 'image/png', sha256: 'b'.repeat(64) },
      })),
    });
    const res = response();

    await instance.content({} as any, res, 'blob-1');

    expect(res.headers['Content-Type']).toBe('image/png');
    expect(res.headers['Content-Disposition']).toContain('inline;');
  });

  it('encodes a non-ASCII filename in both disposicion forms', async () => {
    const { instance } = controller({
      openBlobContent: jest.fn(async () => ({
        stream: { on: jest.fn(), pipe: jest.fn() }, size: 4, last_modified: new Date(),
        row: { file_name: '报告.png', mime_type: 'image/png', sha256: 'c'.repeat(64) },
      })),
    });
    const res = response();

    await instance.content({} as any, res, 'blob-1');

    expect(res.headers['Content-Disposition']).toContain(`filename*=UTF-8''${encodeURIComponent('报告.png')}`);
    expect(res.headers['Content-Disposition']).not.toContain('报告');
  });

  it('passes no viewer for an anonymous caller so only public blobs resolve', async () => {
    const { instance, blobs } = controller();
    await instance.get({} as any, 'blob-1');
    expect(blobs.getBlob).toHaveBeenCalledWith(null, 'blob-1');

    await instance.get({ user: { id: 17 } } as any, 'blob-1');
    expect(blobs.getBlob).toHaveBeenLastCalledWith(expect.objectContaining({ owner_id: '17' }), 'blob-1');
  });

  it('rejects an upload body that is not raw octet-stream', async () => {
    const { instance, blobs } = controller();
    const res = response();

    await instance.upload({ user: { id: 17 } } as any, res, 'upload-1', 'application/json');

    expect(res.body.status).toBe(415);
    expect(res.body.json.error.code).toBe('BLOB_METADATA_INVALID');
    expect(blobs.receiveUpload).not.toHaveBeenCalled();
  });

  it('accepts an octet-stream upload and answers with the V1 envelope', async () => {
    const { instance } = controller();
    const res = response();

    await instance.upload({ user: { id: 17 }, headers: {} } as any, res, 'upload-1', 'application/octet-stream');

    expect(res.body.status).toBe(200);
    expect(res.body.json.data.uploaded).toBe(true);
    expect(res.body.json.meta.api_version).toBe('v1');
  });

  it('tolerates a missing content-type header, since the stream is what matters', async () => {
    const { instance, blobs } = controller();
    const res = response();
    await instance.upload({ user: { id: 17 }, headers: {} } as any, res, 'upload-1', undefined);
    expect(blobs.receiveUpload).toHaveBeenCalled();
  });
});

describe('BlobsController request context', () => {
  it('records the client, request id and IP on mutations', async () => {
    const { instance, blobs } = controller();
    await instance.create(
      { user: { id: 17 }, authContext: { clientId: 'client-9' }, requestId: 'req-1', headers: { 'user-agent': 'agent' }, ip: '127.0.0.1' } as any,
      { key: 'a', file_name: 'a', size_bytes: 1, sha256: 'a'.repeat(64), mime_type: 'text/plain' } as any,
      'idem-1',
    );
    expect(blobs.createUpload).toHaveBeenCalledWith(
      expect.objectContaining({ owner_id: '17' }),
      expect.anything(),
      expect.objectContaining({ clientId: 'client-9', requestId: 'req-1' }),
      'idem-1',
    );
  });

  it('stops a stream error from escaping into an unhandled rejection', async () => {
    const handlers: Record<string, () => void> = {};
    const res = response();
    res.destroy = jest.fn();
    // The body is already streaming by the time a read error surfaces.
    res.headersSent = true;
    const { instance } = controller({
      openBlobContent: jest.fn(async () => ({
        stream: { on: (event: string, handler: () => void) => { handlers[event] = handler; }, pipe: jest.fn() },
        size: 4, last_modified: new Date(),
        row: { file_name: 'a.png', mime_type: 'image/png', sha256: 'a'.repeat(64) },
      })),
    });

    await instance.content({} as any, res, 'blob-1');
    handlers.error();

    // headers were already sent, so the response is torn down instead of
    // attempting a second status line.
    expect(res.destroy).toHaveBeenCalled();
  });
});
