import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { createHash } from 'crypto';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { ResourceSourceSyncService } from './resource-source-sync.service';

const RESOURCE_PUBLIC_ID = '11111111-1111-4111-8111-111111111111';
const VERSION_PUBLIC_ID = '22222222-2222-4222-8222-222222222222';

describe('ResourceSourceSyncService', () => {
  let tempRoot: string;
  let quarantineRoot: string;
  let resource: Record<string, unknown>;
  let sync: Record<string, unknown>;
  let dataSource: any;
  let storage: any;
  let versions: any;
  let service: ResourceSourceSyncService;
  let fetchSpy: jest.SpyInstance;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'resource-source-sync-test-'));
    quarantineRoot = path.join(tempRoot, 'quarantine');
    await fs.mkdir(quarantineRoot, { recursive: true });
    resource = {
      id: 17, user_id: 5, public_id: RESOURCE_PUBLIC_ID, resource_kind: 'mod', status: 'published', is_public: 1,
    };
    sync = {
      id: 9, resource_id: 17, provider: 'github', repository_url: 'https://github.com/owner/mod',
      enabled: 1, stable_only: 1, include_prerelease: 0,
      asset_include_json: null, asset_exclude_json: null, last_polled_at: null, last_status: null,
      last_error: null, upstream_tag: null,
    };
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM resources')) return [resource];
      if (sql.includes('FROM resource_members')) return [];
      if (sql.includes('FROM resource_source_syncs')) return [sync];
      return [];
    });
    dataSource = {
      query,
      transaction: jest.fn(async (callback: (manager: { query: typeof query }) => unknown) => callback({ query })),
    };
    storage = {
      storeIncoming: jest.fn(async (file: Express.Multer.File) => {
        const filePath = path.join(quarantineRoot, path.basename(file.filename));
        await fs.rename(file.path, filePath);
        const bytes = await fs.readFile(filePath);
        return {
          file_name: file.originalname,
          file_path: filePath,
          file_size: bytes.length,
          mime_type: file.mimetype,
          content_hash: createHash('sha256').update(bytes).digest('hex'),
        };
      }),
      removeManaged: jest.fn(async (filePath: string) => {
        await fs.unlink(filePath).catch(() => undefined);
        return true;
      }),
    };
    versions = {
      create: jest.fn(async (dto: Record<string, unknown>) => ({
        public_id: VERSION_PUBLIC_ID,
        version: dto.version,
        version_mode: dto.version_mode,
        revision: 1,
        release_channel: dto.release_channel,
        status: 'published',
        published_at: '2026-10-05T00:00:00.000Z',
      })),
    };
    service = new ResourceSourceSyncService(dataSource, storage, versions);
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(async () => {
    fetchSpy?.mockRestore();
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('upserts a canonical GitHub repository and normalized asset filters for the owner', async () => {
    const result = await service.upsertGithubConfig(RESOURCE_PUBLIC_ID, 5, {
      repository_url: 'https://GitHub.com/Owner/Mod.git/',
      enabled: true,
      stable_only: false,
      include_prerelease: true,
      asset_include: ['*.jar', '*.zip'],
      asset_exclude: ['*-sources.jar'],
    });

    expect(result).toMatchObject({
      resource_public_id: RESOURCE_PUBLIC_ID,
      repository_url: 'https://github.com/owner/mod',
      enabled: true,
      stable_only: false,
      include_prerelease: true,
      asset_include: ['*.jar', '*.zip'],
      asset_exclude: ['*-sources.jar'],
      polling: 'manual',
    });
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(dataSource.query).toHaveBeenCalledWith(expect.stringContaining('ON DUPLICATE KEY UPDATE'), expect.any(Array));
    expect(JSON.stringify(result)).not.toMatch(/\b(?:resource_id|sync_id|id)\s*:/);
  });

  it('rejects non-canonical hosts and contradictory stable/prerelease policy', async () => {
    await expect(service.upsertGithubConfig(RESOURCE_PUBLIC_ID, 5, {
      repository_url: 'https://github.com.evil.example/owner/mod', enabled: true,
    })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.upsertGithubConfig(RESOURCE_PUBLIC_ID, 5, {
      repository_url: 'https://github.com/owner/mod', enabled: true,
      stable_only: true, include_prerelease: true,
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('requires owner or active maintainer rights for configuration', async () => {
    resource.user_id = 99;
    dataSource.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM resources')) return [resource];
      if (sql.includes('FROM resource_members')) return [];
      return [];
    });
    await expect(service.upsertGithubConfig(RESOURCE_PUBLIC_ID, 5, {
      repository_url: 'https://github.com/owner/mod', enabled: true,
    })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('manually polls bounded releases and includes bounded README/license previews', async () => {
    const encode = (text: string) => Buffer.from(text).toString('base64');
    fetchSpy.mockImplementation(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/releases')) return jsonResponse([
        { tag_name: 'v1.0', name: 'Stable', body: 'stable notes', prerelease: false, draft: false, published_at: '2026-01-01T00:00:00Z', assets: [
          { name: 'mod-1.0.jar', size: 22, state: 'uploaded', browser_download_url: 'https://github.com/owner/mod/releases/download/v1/mod-1.0.jar' },
          { name: 'notes.txt', size: 10, state: 'uploaded', browser_download_url: 'https://github.com/owner/mod/releases/download/v1/notes.txt' },
        ] },
        { tag_name: 'v2-beta', name: 'Beta', body: null, prerelease: true, draft: false, assets: [] },
      ]);
      if (url.pathname.endsWith('/readme')) return jsonResponse({ encoding: 'base64', content: encode('# Upstream README') });
      if (url.pathname.endsWith('/license')) return jsonResponse({ name: 'LICENSE', encoding: 'base64', content: encode('MIT License') });
      return jsonResponse({
        full_name: 'owner/mod', description: 'An upstream Mod', default_branch: 'main',
        license: { key: 'mit', name: 'MIT License', spdx_id: 'MIT' },
      });
    });

    const result = await service.listGithubReleases(RESOURCE_PUBLIC_ID, 10);
    expect(result.repository).toMatchObject({
      canonical_url: 'https://github.com/owner/mod',
      readme: { available: true, content: '# Upstream README', truncated: false },
      license: { available: true, key: 'mit', spdx_id: 'MIT', content: 'MIT License' },
    });
    expect(result.releases).toHaveLength(1);
    expect(result.releases[0].tag_name).toBe('v1.0');
    expect(result.releases[0].assets).toHaveLength(2);
    expect(result.releases[0].assets[0].importable).toBe(true);
    expect(result.releases[0].assets[1].importable).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(4);
    expect(dataSource.query).toHaveBeenCalledWith(expect.stringContaining('last_polled_at = UTC_TIMESTAMP()'), expect.any(Array));
  });

  it('filters prereleases and asset names according to source configuration', async () => {
    sync.stable_only = 0;
    sync.include_prerelease = 1;
    sync.asset_include_json = ['*.jar'];
    sync.asset_exclude_json = ['*-sources.jar'];
    fetchSpy.mockImplementation(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/releases')) return jsonResponse([
        { tag_name: 'v1', prerelease: false, assets: [
          { name: 'mod.jar', size: 22, state: 'uploaded', browser_download_url: 'https://github.com/owner/mod/releases/download/v1/mod.jar' },
          { name: 'mod-sources.jar', size: 22, state: 'uploaded', browser_download_url: 'https://github.com/owner/mod/releases/download/v1/mod-sources.jar' },
        ] },
        { tag_name: 'v2-beta', prerelease: true, assets: [] },
      ]);
      if (url.pathname.endsWith('/readme') || url.pathname.endsWith('/license')) return jsonResponse(null, 404);
      return jsonResponse({ full_name: 'owner/mod' });
    });
    const result = await service.listGithubReleases(RESOURCE_PUBLIC_ID, 10);
    expect(result.releases.map((release: any) => release.tag_name)).toEqual(['v1', 'v2-beta']);
    expect(result.releases[0].assets.map((asset: any) => asset.name)).toEqual(['mod.jar']);
  });

  it('imports a selected safe asset through quarantine and the existing version analyzer path', async () => {
    const zip = minimalZip();
    fetchSpy.mockImplementation(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.hostname === 'api.github.com') return jsonResponse({
        tag_name: 'v1.2.0', name: 'Release', body: 'Release notes', prerelease: false, draft: false,
        assets: [{ name: 'mod.jar', size: zip.length, state: 'uploaded', browser_download_url: 'https://github.com/owner/mod/releases/download/v1.2.0/mod.jar' }],
      });
      return new Response(zip, { status: 200, headers: { 'content-type': 'application/java-archive' } });
    });

    const result = await service.importGithubRelease(RESOURCE_PUBLIC_ID, 5, { tag_name: 'v1.2.0', asset_name: 'mod.jar' });
    expect(storage.storeIncoming).toHaveBeenCalledTimes(1);
    expect(versions.create).toHaveBeenCalledWith(expect.objectContaining({
      resource_id: 17,
      version: 'v1.2.0',
      version_mode: 'compatibility',
      release_channel: 'release',
      content: 'Release notes',
    }), expect.objectContaining({ file_path: expect.stringContaining('quarantine') }), 5);
    expect(result).toEqual(expect.objectContaining({
      resource_public_id: RESOURCE_PUBLIC_ID,
      tag_name: 'v1.2.0',
      asset_name: 'mod.jar',
      version: expect.objectContaining({ public_id: VERSION_PUBLIC_ID, revision: 1 }),
    }));
    expect(JSON.stringify(result)).not.toMatch(/\b(?:resource_id|version_id|file_id)\s*:/);
    expect(storage.removeManaged).not.toHaveBeenCalled();
  });

  it('rejects unsafe asset redirects before any request to the redirected host', async () => {
    const zip = minimalZip();
    fetchSpy.mockImplementation(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.hostname === 'api.github.com') return jsonResponse({
        tag_name: 'v1.2.0', prerelease: false, draft: false,
        assets: [{ name: 'mod.jar', size: zip.length, state: 'uploaded', browser_download_url: 'https://github.com/owner/mod/releases/download/v1.2.0/mod.jar' }],
      });
      return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } });
    });

    await expect(service.importGithubRelease(RESOURCE_PUBLIC_ID, 5, { tag_name: 'v1.2.0', asset_name: 'mod.jar' }))
      .rejects.toThrow('Unable to retrieve the selected GitHub release asset');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(versions.create).not.toHaveBeenCalled();
    expect(storage.storeIncoming).not.toHaveBeenCalled();
  });

  it('enforces the download size cap using response metadata before buffering the body', async () => {
    fetchSpy.mockImplementation(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.hostname === 'api.github.com') return jsonResponse({
        tag_name: 'v1.2.0', prerelease: false, draft: false,
        assets: [{ name: 'mod.jar', size: 22, state: 'uploaded', browser_download_url: 'https://github.com/owner/mod/releases/download/v1.2.0/mod.jar' }],
      });
      return new Response(null, { status: 200, headers: { 'content-length': String(50 * 1024 * 1024 + 1) } });
    });
    await expect(service.importGithubRelease(RESOURCE_PUBLIC_ID, 5, { tag_name: 'v1.2.0', asset_name: 'mod.jar' }))
      .rejects.toThrow('Unable to retrieve the selected GitHub release asset');
    expect(versions.create).not.toHaveBeenCalled();
  });

  it('removes a quarantined file when ResourceVersionService rejects the immutable import', async () => {
    const zip = minimalZip();
    versions.create.mockRejectedValueOnce(new ConflictException('duplicate content'));
    fetchSpy.mockImplementation(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.hostname === 'api.github.com') return jsonResponse({
        tag_name: 'v1.2.0', prerelease: false, draft: false,
        assets: [{ name: 'mod.jar', size: zip.length, state: 'uploaded', browser_download_url: 'https://github.com/owner/mod/releases/download/v1.2.0/mod.jar' }],
      });
      return new Response(zip, { status: 200 });
    });

    await expect(service.importGithubRelease(RESOURCE_PUBLIC_ID, 5, { tag_name: 'v1.2.0', asset_name: 'mod.jar' }))
      .rejects.toBeInstanceOf(ConflictException);
    expect(storage.removeManaged).toHaveBeenCalledTimes(1);
    const files = await fs.readdir(quarantineRoot);
    expect(files).toHaveLength(0);
  });
});

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(value === null ? null : JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function minimalZip(): Buffer {
  const bytes = Buffer.alloc(22);
  bytes.writeUInt32LE(0x06054b50, 0);
  return bytes;
}
