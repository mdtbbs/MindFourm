import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Resource } from '@entities/resource.entity';
import { ResourceDirectUploadDraft } from '@entities/resource-direct-upload-draft.entity';
import { ResourceDirectUploadSession } from '@entities/resource-direct-upload-session.entity';
import { ResourceVersion } from '@entities/resource-version.entity';
import { createHash } from 'crypto';
import { ResourceDirectUploadService } from './resource-direct-upload.service';

describe('ResourceDirectUploadService', () => {
  const version = { id: 7, public_id: 'version-public-id', resource_id: 9, version: '1.0.0', version_mode: 'compatibility', release_channel: 'release', status: 'upload_pending' };
  const resource = { id: 9, public_id: '10000000-0000-4000-8000-000000000001', user_id: 3, resource_kind: 'map', status: 'pending', deleted_at: null };
  const actor = { id: 3, role: 'user' };
  const input = { version_public_id: 'version-public-id', filename: 'map.msav', size_bytes: 123, mime_type: 'application/octet-stream', sha256: 'a'.repeat(64) };

  function make() {
    const sessions = { create: jest.fn((row) => row), save: jest.fn(async (row) => row), findOne: jest.fn() };
    const versions = { findOne: jest.fn().mockResolvedValue(version) };
    const resources = { findOne: jest.fn().mockResolvedValue(resource) };
    const files = { exist: jest.fn().mockResolvedValue(false) };
    const drafts = { findOne: jest.fn().mockResolvedValue({ id: 'draft-id', resource_version_id: 7, user_id: 3, status: 'open', expires_at: new Date(Date.now() + 60_000) }), update: jest.fn() };
    const repositories = new Map<any, any>();
    const manager = {
      getRepository: jest.fn((entity) => repositories.get(entity) || { findOne: jest.fn() }),
      findOne: jest.fn(), exists: jest.fn().mockResolvedValue(false),
      query: jest.fn(async () => []), save: jest.fn(), update: jest.fn(), create: jest.fn((_entity, value) => value),
    };
    const dataSource = { manager: { exists: jest.fn().mockResolvedValue(false) }, transaction: jest.fn(async (callback) => callback(manager)) };
    const res = {
      createUploadSession: jest.fn(), getObject: jest.fn(),
      getObjectContent: jest.fn(),
      createBinding: jest.fn().mockResolvedValue({ id: 'binding-1' }), deleteBinding: jest.fn(),
    };
    const v2Writes = { completeDirectVersion: jest.fn().mockResolvedValue({}) };
    const resourceLifecycle = { completeInitialDirectUpload: jest.fn().mockResolvedValue({ file_public_id: 'initial-file', version_public_id: version.public_id }) };
    const service = new ResourceDirectUploadService(sessions as any, versions as any, resources as any, files as any, dataSource as any, res as any, drafts as any, v2Writes as any, resourceLifecycle as any);
    return { service, sessions, versions, resources, files, drafts, manager, dataSource, res, repositories, v2Writes, resourceLifecycle };
  }

  it('returns only a short RES upload token and persists the actor/version context', async () => {
    const { service, sessions, res } = make();
    res.createUploadSession.mockResolvedValue({ deduplicated: false, upload: { session_id: 'res-session', url: 'https://res.example/upload/1', token: 'short-token', expires_at: new Date(Date.now() + 60_000).toISOString() } });
    const result = await service.init(input, actor);
    expect(result).toMatchObject({ deduplicated: false, upload: { token: 'short-token' }, complete_required: true });
    expect(sessions.save).toHaveBeenCalledWith(expect.objectContaining({ user_id: actor.id, resource_version_id: version.id, filename: input.filename }));
  });

  it('requires complete even for deduplicated objects', async () => {
    const { service, sessions, res } = make();
    res.createUploadSession.mockResolvedValue({ deduplicated: true, object: { id: 'internal', public_id: 'public', sha256: 'a'.repeat(64), size_bytes: 123 } });
    await expect(service.init(input, actor)).resolves.toMatchObject({ deduplicated: true, object_public_id: 'public', complete_required: true });
    expect(sessions.save).toHaveBeenCalledWith(expect.objectContaining({ object_public_id: 'public' }));
  });

  it('rejects invalid size, extension and revoked write permission before contacting RES', async () => {
    const { service, resources, res } = make();
    await expect(service.init({ ...input, size_bytes: 0 }, actor)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.init({ ...input, sha256: '' }, actor)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.init({ ...input, filename: 'map.zip' }, actor)).rejects.toBeInstanceOf(BadRequestException);
    resources.findOne.mockResolvedValue({ ...resource, user_id: 4 });
    await expect(service.init(input, actor)).rejects.toBeInstanceOf(ForbiddenException);
    expect(res.createUploadSession).not.toHaveBeenCalled();
  });

  it('accepts active V2 publishers and rejects a staff account without membership', async () => {
    const { service, resources, dataSource, res } = make();
    resources.findOne.mockResolvedValue({ ...resource, user_id: 4, status: 'approved' });
    res.createUploadSession.mockResolvedValue({ deduplicated: true, object: { public_id: 'public', sha256: input.sha256, size_bytes: input.size_bytes } });
    await expect(service.init(input, { ...actor, role: 'moderator' })).rejects.toBeInstanceOf(ForbiddenException);
    dataSource.manager.exists.mockResolvedValue(true);
    await expect(service.init(input, actor)).resolves.toMatchObject({ complete_required: true });
    expect(dataSource.manager.exists).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ where: expect.arrayContaining([
      expect.objectContaining({ resource_id: resource.id, user_id: actor.id, status: 'active', role: 'publisher' }),
    ]) }));
  });

  it('ignores browser metadata and rejects a RES object not verified', async () => {
    const { service, sessions, res } = make();
    sessions.findOne.mockResolvedValue({ id: 'session', user_id: 3, resource_version_id: 7, role: 'primary', filename: 'map.msav', size_bytes: 123, mime_type: 'application/octet-stream', sha256: null, object_public_id: null, resource_file_public_id: null, expires_at: new Date(Date.now() + 60_000) });
    res.getObject.mockResolvedValue({ public_id: 'object', state: 'pending', sha256: 'a'.repeat(64), size_bytes: 123, mime_type: 'application/octet-stream', original_filename: 'map.msav' });
    await expect(service.complete('session', 'object', actor)).rejects.toBeInstanceOf(ConflictException);
    expect(res.createBinding).not.toHaveBeenCalled();
  });

  it('rechecks version permission at complete and returns same file on replay', async () => {
    const { service, sessions, resources, res } = make();
    sessions.findOne.mockResolvedValue({ id: 'session', user_id: 3, resource_version_id: 7, role: 'primary', filename: 'map.msav', size_bytes: 123, mime_type: 'application/octet-stream', sha256: null, object_public_id: null, resource_file_public_id: null, expires_at: new Date(Date.now() + 60_000) });
    resources.findOne.mockResolvedValue({ ...resource, user_id: 4 });
    await expect(service.complete('session', 'object', actor)).rejects.toBeInstanceOf(ForbiddenException);
    expect(res.getObject).not.toHaveBeenCalled();
    sessions.findOne.mockResolvedValue({ resource_file_public_id: 'file-public-id' });
    await expect(service.complete('session', 'object', actor)).resolves.toEqual({ file_public_id: 'file-public-id', completed: true });
  });

  it('re-downloads and hashes RES bytes before the shared server analyzer finalizes the version', async () => {
    const { service, sessions, res, repositories, drafts, v2Writes } = make();
    const bytes = Buffer.alloc(123, 65);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const pending = { id: 'session', user_id: 3, resource_version_id: 7, role: 'primary', filename: 'map.msav', size_bytes: 123,
      mime_type: 'application/octet-stream', sha256, object_public_id: null,
      resource_file_public_id: null, expires_at: new Date(Date.now() + 60_000) };
    sessions.findOne.mockResolvedValue(pending);
    sessions.findOne.mockResolvedValueOnce(pending).mockResolvedValueOnce({ ...pending, resource_file_public_id: 'file-public-id' });
    drafts.findOne.mockResolvedValue({ id: 'draft-id', resource_version_id: 7, user_id: 3, status: 'open',
      expires_at: new Date(Date.now() + 60_000), request_metadata: { version: '1.0.0', version_mode: 'compatibility', release_channel: 'release' } });
    repositories.set(ResourceDirectUploadSession, { findOne: jest.fn().mockResolvedValue(pending) });
    repositories.set(ResourceDirectUploadDraft, { findOne: jest.fn().mockResolvedValue({ id: 'draft-id', resource_version_id: 7, user_id: 3, status: 'open', expires_at: new Date(Date.now() + 60_000) }) });
    repositories.set(ResourceVersion, { findOne: jest.fn().mockResolvedValue(version) });
    repositories.set(Resource, { findOne: jest.fn().mockResolvedValue(resource) });
    res.getObject.mockResolvedValue({ public_id: 'object', state: 'verified', sha256, size_bytes: 123,
      mime_type: 'application/octet-stream', original_filename: 'first-upload.msav' });
    res.getObjectContent.mockResolvedValue(bytes);
    const result = await service.complete('session', 'object', actor);
    expect(result).toMatchObject({ completed: true, file_public_id: expect.any(String) });
    expect(v2Writes.completeDirectVersion).toHaveBeenCalledWith(resource.public_id, expect.objectContaining({
      storage_backend: 'res', provider_object_id: 'object', content_hash: sha256,
    }), expect.objectContaining({ version: '1.0.0' }), actor.id, expect.objectContaining({ verifiedBytes: bytes, objectPublicId: 'object' }));
    expect(res.getObjectContent).toHaveBeenCalledWith('object', expect.anything());
    expect(res.createBinding).not.toHaveBeenCalled();
  });

  it('routes initial drafts through the existing server-side aggregate analyzer after verifying RES bytes', async () => {
    const { service, sessions, resources, res, drafts, resourceLifecycle } = make();
    const bytes = Buffer.from('initial resource bytes');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const pending = { id: 'session', user_id: 3, resource_version_id: 7, role: 'primary', filename: 'map.msav', size_bytes: bytes.length,
      mime_type: 'application/octet-stream', sha256, object_public_id: null,
      resource_file_public_id: null, expires_at: new Date(Date.now() + 60_000) };
    sessions.findOne.mockResolvedValue(pending);
    resources.findOne.mockResolvedValue({ ...resource, status: 'draft' });
    drafts.findOne.mockResolvedValue({ id: 'draft-id', resource_version_id: 7, user_id: 3, status: 'open',
      expires_at: new Date(Date.now() + 60_000), request_metadata: { title: 'Map', version: '1.0' } });
    res.getObject.mockResolvedValue({ public_id: 'object', state: 'verified', sha256, size_bytes: bytes.length,
      mime_type: 'application/octet-stream', original_filename: 'first-upload.msav' });
    res.getObjectContent.mockResolvedValue(bytes);

    await expect(service.complete('session', 'object', actor)).resolves.toMatchObject({
      completed: true, file_public_id: 'initial-file', version_public_id: version.public_id,
    });
    expect(resourceLifecycle.completeInitialDirectUpload).toHaveBeenCalledWith(expect.objectContaining({
      versionId: version.id, draftId: 'draft-id', sessionId: 'session', objectPublicId: 'object',
      file: expect.objectContaining({ storage_backend: 'res', content_hash: sha256 }),
    }));
  });

  it('creates an idempotent metadata-only version draft in the authorized resource scope', async () => {
    const { service, manager, dataSource, repositories } = make();
    const drafts = { findOne: jest.fn().mockResolvedValue(null) };
    repositories.set(ResourceDirectUploadDraft, drafts);
    manager.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM resources')) return [resource];
      if (sql.includes('MAX(revision)')) return [{ max_revision: 2 }];
      return [];
    });
    manager.save.mockImplementation(async (entity, row) => entity === ResourceVersion
      ? { ...row, id: 8 }
      : { ...row });

    const result = await service.createVersionDraft('10000000-0000-4000-8000-000000000001', { version: '1.0.0', version_mode: 'semver' }, actor, 'same-key');
    expect(result).toMatchObject({
      resource_public_id: resource.public_id,
      resource_id: resource.id,
      version_public_id: expect.any(String),
      upload_draft_id: expect.any(String),
      revision: 3,
      draft_status: 'open',
      version_status: 'upload_pending',
    });
    expect(manager.save).toHaveBeenCalledWith(ResourceVersion, expect.objectContaining({ status: 'upload_pending' }));
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it('requires an idempotency key and rejects key reuse with a different version payload', async () => {
    const { service, manager, repositories } = make();
    repositories.set(ResourceDirectUploadDraft, { findOne: jest.fn().mockResolvedValue({
      id: 'existing-draft', resource_version_id: 7, user_id: actor.id, status: 'open',
      expires_at: new Date(Date.now() + 60_000), request_fingerprint: 'different-fingerprint',
    }) });
    manager.query.mockImplementation(async (sql) => sql.includes('FROM resources') ? [resource] : []);
    await expect(service.createVersionDraft('10000000-0000-4000-8000-000000000001', { version: '1.0.0' }, actor, undefined))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.createVersionDraft('10000000-0000-4000-8000-000000000001', { version: '2.0.0' }, actor, 'same-key'))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('replays the winning metadata draft when identical concurrent requests collide on the idempotency index', async () => {
    const { service, drafts, versions, dataSource } = make();
    const input = { version: '1.0.0' };
    const publicId = resource.public_id;
    const fingerprint = createHash('sha256').update(JSON.stringify((service as any).canonical({ resource_public_id: publicId, input }))).digest('hex');
    const existing = {
      id: 'winning-draft', resource_version_id: version.id, user_id: actor.id,
      request_fingerprint: fingerprint, status: 'open', expires_at: new Date(Date.now() + 60_000),
    };
    drafts.findOne.mockResolvedValue(existing);
    versions.findOne.mockResolvedValue({ ...version, revision: 4 });
    dataSource.transaction.mockRejectedValue(Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY', errno: 1062 }));

    await expect(service.createVersionDraft(publicId, input, actor, 'same-key')).resolves.toMatchObject({
      version_public_id: version.public_id, upload_draft_id: 'winning-draft', revision: 4, draft_status: 'open',
    });
  });

  it('rejects review/upload completion after an incomplete draft has expired or lost its open state', async () => {
    const { service, drafts, sessions, res } = make();
    drafts.findOne.mockResolvedValue({ id: 'expired-draft', resource_version_id: 7, user_id: actor.id, status: 'expired', expires_at: new Date(Date.now() - 1) });
    await expect(service.init(input, actor)).rejects.toBeInstanceOf(ConflictException);
    expect(res.createUploadSession).not.toHaveBeenCalled();
    expect(sessions.save).not.toHaveBeenCalled();
  });
});
