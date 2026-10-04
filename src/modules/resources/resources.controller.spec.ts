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
    const previews = { readPreview: jest.fn().mockResolvedValue(Buffer.from('png')), supports: jest.fn().mockReturnValue(true), enqueue: jest.fn().mockResolvedValue(undefined) };
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
