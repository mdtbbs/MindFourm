import type { Response } from 'express';
import { ResourcesController } from './resources.controller';
import { RESOURCE_TRANSFER_FORMAT } from './resource-transfer.util';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

describe('ResourcesController.getById', () => {
  const response = {
    redirect: jest.fn(),
    json: jest.fn(),
  } as unknown as Response;
  const resourcesService = {
    findMergedResourceTarget: jest.fn(),
    getByIdWithVersions: jest.fn(),
  };

  let controller: ResourcesController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = Object.create(ResourcesController.prototype) as ResourcesController;
    Object.defineProperty(controller, 'resourcesService', { value: resourcesService });
    response.redirect = jest.fn() as unknown as Response['redirect'];
    response.json = jest.fn() as unknown as Response['json'];
  });

  it('returns a JSON envelope for an ordinary resource', async () => {
    const resource = { id: 12, title: 'Resource 12' };
    resourcesService.findMergedResourceTarget.mockResolvedValue(null);
    resourcesService.getByIdWithVersions.mockResolvedValue(resource);

    await controller.getById(12, { user: { id: 7 } }, response);

    expect(response.redirect).not.toHaveBeenCalled();
    expect(resourcesService.getByIdWithVersions).toHaveBeenCalledWith(12, { id: 7 });
    expect(response.json).toHaveBeenCalledWith({ success: true, data: resource });
  });

  it('permanently redirects a merged resource to its canonical id', async () => {
    resourcesService.findMergedResourceTarget.mockResolvedValue(3);

    await controller.getById(12, { user: null }, response);

    expect(response.redirect).toHaveBeenCalledWith(301, '/api/resources/3');
    expect(resourcesService.getByIdWithVersions).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
  });
});

describe('ResourcesController resource transfer', () => {
  it('exports a source-bound transfer manifest for an administrator', async () => {
    const controller = Object.create(ResourcesController.prototype) as ResourcesController;
    const resource = { id: 12, public_id: 'public-12', title: 'Map' };
    const resourcesService = { getTransferExportData: jest.fn().mockResolvedValue(resource) };
    Object.defineProperty(controller, 'resourcesService', { value: resourcesService });
    Object.defineProperty(controller, 'siteConfig', { value: { current: { profile: 'mindustry-club', domain: 'mindustry.club' } } });

    const manifest = await controller.exportManifest(12, { user: { id: 7, role: 'admin' } });

    expect(resourcesService.getTransferExportData).toHaveBeenCalledWith(12, { id: 7, role: 'admin' });
    expect(manifest).toMatchObject({
      format: RESOURCE_TRANSFER_FORMAT,
      origin: { site: 'mindustry-club', resource_id: '12' },
      resource: { title: 'Map' },
    });
  });

  it('imports an external resource with trusted origin provenance', async () => {
    const controller = Object.create(ResourcesController.prototype) as ResourcesController;
    const resourcesService = { create: jest.fn().mockResolvedValue({ id: 92, title: 'Mod' }) };
    Object.defineProperty(controller, 'resourcesService', { value: resourcesService });
    Object.defineProperty(controller, 'siteConfig', { value: { current: { profile: 'mindustry-club' } } });
    Object.defineProperty(controller, 'resourceStorageService', { value: { storeIncoming: jest.fn() } });
    Object.defineProperty(controller, 'logsService', { value: { log: jest.fn().mockResolvedValue(undefined) } });
    const manifest = {
      format: RESOURCE_TRANSFER_FORMAT,
      origin: { site: 'mdtbbs', resource_id: '23', url: 'https://mdtbbs.cn/resources/23' },
      resource: {
        title: 'Mod', resource_type: 'external', resource_kind: 'mod', version: '1.0.0',
        external_url: 'https://github.com/example/mod', is_public: 1,
      },
    };

    const result = await controller.importManifest({ manifest: JSON.stringify(manifest), is_public: '1' }, undefined, {
      user: { id: 7, role: 'admin' }, headers: {},
    });

    expect(resourcesService.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Mod', resource_type: 'external' }),
      7,
      undefined,
      expect.objectContaining({ origin: { site: 'mdtbbs', resourceId: '23', url: 'https://mdtbbs.cn/resources/23' } }),
    );
    expect(result).toEqual({ resource: { id: 92, title: 'Mod' } });
  });
});

describe('ResourcesController internal file access', () => {
  function setup(resource: any) {
    const controller = Object.create(ResourcesController.prototype) as ResourcesController;
    const domain = { getForFileAccess: jest.fn().mockResolvedValue(resource), incrementDownload: jest.fn().mockResolvedValue(undefined) };
    const previews = { getResPreviewUrl: jest.fn().mockResolvedValue(null), readPreview: jest.fn().mockResolvedValue(Buffer.from('png')), supports: jest.fn().mockReturnValue(true), enqueue: jest.fn().mockResolvedValue(undefined) };
    const downloadPolicy = { assertDownloadAuthentication: jest.fn().mockResolvedValue(undefined) };
    Object.defineProperty(controller, 'resourcesService', { value: domain });
    Object.defineProperty(controller, 'resourcePreviewService', { value: previews });
    Object.defineProperty(controller, 'downloadPolicy', { value: downloadPolicy });
    Object.defineProperty(controller, 'logOperation', { value: jest.fn() });
    return { controller, domain, previews, downloadPolicy };
  }

  it('passes the authorized storage key to the preview reader and returns only image bytes', async () => {
    const resource = { id: 12, renderer_status: 'ready', renderer_preview_key: 'map/preview.png' };
    const { controller, domain, previews } = setup(resource);
    const response = { setHeader: jest.fn(), send: jest.fn() };
    await controller.getPreview(12, { user: null }, response as any);
    expect(domain.getForFileAccess).toHaveBeenCalledWith(12, null);
    expect(previews.readPreview).toHaveBeenCalledWith(resource);
    expect(response.send).toHaveBeenCalledWith(Buffer.from('png'));
  });

  it('redirects a RES file after recording DownloadGrant on the legacy web download route', async () => {
    const { controller, domain } = setup({ id: 12, status: 'approved', is_public: 1, file_path: null });
    const stored = { version: { id: 31 }, file: { id: 42, storage_backend: 'res' } };
    Object.assign(domain, { findStoredDownloadFile: jest.fn().mockResolvedValue(stored) });
    const provider = { getDownloadTarget: jest.fn().mockResolvedValue({ kind: 'redirect', url: 'https://res.example/o/object/map.msav' }) };
    const grants = { recordGrant: jest.fn().mockResolvedValue(true) };
    Object.defineProperty(controller, 'fileProvider', { value: provider });
    Object.defineProperty(controller, 'downloadGrants', { value: grants });
    const response = { redirect: jest.fn() };
    await controller.download(12, undefined, response as any, { user: { id: 9 } });
    expect(grants.recordGrant).toHaveBeenCalledWith(expect.objectContaining({ resourceId: 12, versionId: 31, fileId: 42, backend: 'res' }), 'user:9');
    expect(response.redirect).toHaveBeenCalledWith(302, 'https://res.example/o/object/map.msav');
    expect(domain.incrementDownload).not.toHaveBeenCalled();
  });

  it('streams a root resource file without requiring a version id', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'forum-download-test-'));
    try {
      const file = join(folder, 'map.msav');
      await writeFile(file, Buffer.from('actual map bytes'));
      const { controller, domain } = setup({ id: 12, file_path: file, file_name: 'map.msav', mime_type: 'application/octet-stream' });
      const response = { set: jest.fn() };
      const download = await controller.download(12, undefined, response as any, { user: null });
      const chunks: Buffer[] = [];
      for await (const chunk of (download as any).getStream()) chunks.push(Buffer.from(chunk));
      expect(Buffer.concat(chunks).toString()).toBe('actual map bytes');
      expect(domain.incrementDownload).toHaveBeenCalledWith(12);
    } finally { await rm(folder, { recursive: true, force: true }); }
  });

  it('records a completed managed stream once and skips grants for an aborted body', async () => {
    const { EventEmitter } = await import('events');
    const folder = await mkdtemp(join(tmpdir(), 'forum-download-complete-'));
    try {
      const file = join(folder, 'map.msav');
      await writeFile(file, Buffer.from('actual map bytes'));
      const { controller, domain } = setup({ id: 12, file_path: file, file_name: 'map.msav', mime_type: 'application/octet-stream' });
      const events = { recordCompletion: jest.fn().mockResolvedValue(true) };
      Object.defineProperty(controller, 'downloadEvents', { value: events });

      const response = new EventEmitter() as any;
      response.statusCode = 200; response.writableFinished = true; response.set = jest.fn();
      const download = await controller.download(12, undefined, response as any, { user: { id: 9 }, headers: {} });
      response.emit('finish');
      await Promise.resolve();
      expect(events.recordCompletion).toHaveBeenCalledTimes(1);
      expect(events.recordCompletion).toHaveBeenCalledWith(expect.objectContaining({
        event_type: 'completed', resource_id: 12, user_id: 9, client_type: 'web',
      }), 'user:9');
      (download as any).getStream?.();

      const aborted = new EventEmitter() as any;
      aborted.statusCode = 200; aborted.writableFinished = false; aborted.set = jest.fn();
      await controller.download(12, undefined, aborted as any, { user: { id: 9 }, headers: {} });
      aborted.emit('close');
      await Promise.resolve();
      expect(events.recordCompletion).toHaveBeenCalledTimes(1);
      expect(domain.incrementDownload).toHaveBeenCalledTimes(2);
    } finally { await rm(folder, { recursive: true, force: true }); }
  });

  it('attributes a legacy root-file completion to no version or file row', async () => {
    const { EventEmitter } = await import('events');
    const folder = await mkdtemp(join(tmpdir(), 'forum-download-legacy-'));
    try {
      const file = join(folder, 'legacy-root.msav');
      await writeFile(file, Buffer.from('legacy root bytes'));
      // The root file is streamed while a published version with its own file
      // row exists under a different path. Recording `stored` would hang the
      // completion on the file that was never sent.
      const { controller, domain } = setup({ id: 12, file_path: file, file_name: 'legacy-root.msav', mime_type: 'application/octet-stream' });
      Object.assign(domain, {
        findStoredDownloadFile: jest.fn().mockResolvedValue({ version: { id: 31, file_path: join(folder, 'published-but-not-streamed.msav') }, file: { id: 42 } }),
      });
      const events = { recordCompletion: jest.fn().mockResolvedValue(true) };
      Object.defineProperty(controller, 'downloadEvents', { value: events });

      const response = new EventEmitter() as any;
      response.statusCode = 200; response.writableFinished = true; response.set = jest.fn();
      const download = await controller.download(12, undefined, response as any, { user: null, headers: {} });
      response.emit('finish');
      await Promise.resolve();

      expect(events.recordCompletion).toHaveBeenCalledWith(expect.objectContaining({
        resource_id: 12, version_id: null, file_id: null,
      }), expect.any(String));
      (download as any).getStream?.();
    } finally { await rm(folder, { recursive: true, force: true }); }
  });

  it('attributes a versioned completion to the version and file that were streamed', async () => {
    const { EventEmitter } = await import('events');
    const folder = await mkdtemp(join(tmpdir(), 'forum-download-versioned-'));
    try {
      const file = join(folder, 'v3.msav');
      await writeFile(file, Buffer.from('v3 bytes'));
      const { controller, domain } = setup({ id: 12, file_path: null });
      Object.assign(domain, {
        findStoredDownloadFile: jest.fn().mockResolvedValue({ version: { id: 31, file_path: file }, file: { id: 42 } }),
      });
      Object.defineProperty(controller, 'versionService', {
        value: { getDownloadTarget: jest.fn().mockResolvedValue({ id: 31, file_path: file, mime_type: 'application/octet-stream', file_name: 'v3.msav' }) },
      });
      const events = { recordCompletion: jest.fn().mockResolvedValue(true) };
      Object.defineProperty(controller, 'downloadEvents', { value: events });

      const response = new EventEmitter() as any;
      response.statusCode = 200; response.writableFinished = true; response.set = jest.fn();
      const download = await controller.download(12, '31', response as any, { user: { id: 9 }, headers: {} });
      response.emit('finish');
      await Promise.resolve();

      expect(events.recordCompletion).toHaveBeenCalledWith(expect.objectContaining({
        resource_id: 12, version_id: 31, file_id: 42,
      }), 'user:9');
      (download as any).getStream?.();
    } finally { await rm(folder, { recursive: true, force: true }); }
  });

  it('attributes a bare-request completion to the published version whose bytes were streamed', async () => {
    const { EventEmitter } = await import('events');
    const folder = await mkdtemp(join(tmpdir(), 'forum-download-bare-published-'));
    try {
      const file = join(folder, 'published-v3.msav');
      await writeFile(file, Buffer.from('published v3 bytes'));
      // `getForFileAccess` has already swapped the resource's own path for the
      // latest published version's, so a request that named no version still
      // streams the version's bytes and must be recorded against it.
      const { controller, domain } = setup({ id: 12, file_path: file, file_name: 'published-v3.msav', mime_type: 'application/octet-stream' });
      Object.assign(domain, {
        findStoredDownloadFile: jest.fn().mockResolvedValue({ version: { id: 31, file_path: file }, file: { id: 42 } }),
      });
      const events = { recordCompletion: jest.fn().mockResolvedValue(true) };
      Object.defineProperty(controller, 'downloadEvents', { value: events });

      const response = new EventEmitter() as any;
      response.statusCode = 200; response.writableFinished = true; response.set = jest.fn();
      const download = await controller.download(12, undefined, response as any, { user: null, headers: {} });
      response.emit('finish');
      await Promise.resolve();

      // Nulling both ids here would give this request a different dedup key from
      // `/download?version_id=31` for the same bytes, counting one visitor twice.
      expect(events.recordCompletion).toHaveBeenCalledWith(expect.objectContaining({
        resource_id: 12, version_id: 31, file_id: 42,
      }), expect.any(String));
      (download as any).getStream?.();
    } finally { await rm(folder, { recursive: true, force: true }); }
  });

  it('attributes an explicit download of an older version to that version row', async () => {
    const { EventEmitter } = await import('events');
    const folder = await mkdtemp(join(tmpdir(), 'forum-download-old-version-'));
    try {
      const oldFile = join(folder, 'v2.msav');
      await writeFile(oldFile, Buffer.from('v2 bytes'));
      // `/download?version_id=31` naming an older version whose path differs
      // from the resource's current path: the older version is what streamed.
      const { controller, domain } = setup({ id: 12, file_path: join(folder, 'v4.msav'), file_name: 'v4.msav', mime_type: 'application/octet-stream' });
      Object.assign(domain, {
        findStoredDownloadFile: jest.fn().mockResolvedValue({ version: { id: 31, file_path: oldFile }, file: { id: 42 } }),
      });
      Object.defineProperty(controller, 'versionService', {
        value: { getDownloadTarget: jest.fn().mockResolvedValue({ id: 31, file_path: oldFile, mime_type: 'application/octet-stream', file_name: 'v2.msav' }) },
      });
      const events = { recordCompletion: jest.fn().mockResolvedValue(true) };
      Object.defineProperty(controller, 'downloadEvents', { value: events });

      const response = new EventEmitter() as any;
      response.statusCode = 200; response.writableFinished = true; response.set = jest.fn();
      const download = await controller.download(12, '31', response as any, { user: null, headers: {} });
      response.emit('finish');
      await Promise.resolve();

      expect(events.recordCompletion).toHaveBeenCalledWith(expect.objectContaining({
        resource_id: 12, version_id: 31, file_id: 42,
      }), expect.any(String));
      (download as any).getStream?.();
    } finally { await rm(folder, { recursive: true, force: true }); }
  });

  it('preserves the validated MFL download redirect internally', async () => {
    const { controller } = setup({ id: 12, use_mfl: 1, mfl_download_url: 'https://files.example.test/map.msav' });
    const response = { redirect: jest.fn() };
    await controller.download(12, undefined, response as any, { user: null });
    expect(response.redirect).toHaveBeenCalledWith('https://files.example.test/map.msav');
  });

  it('passes file source fields to an authorized preview retry', async () => {
    const resource = { id: 12, resource_kind: 'map', file_path: '/private/map.msav', content_hash: 'sha256' };
    const { controller, domain, previews } = setup(resource);
    const user = { id: 7, role: 'admin' };
    await controller.retryPreview(12, { user });
    expect(domain.getForFileAccess).toHaveBeenCalledWith(12, user);
    expect(previews.enqueue).toHaveBeenCalledWith(resource);
  });
});
