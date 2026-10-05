import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ResourceDirectUploadService } from './resource-direct-upload.service';

describe('ResourceDirectUploadService', () => {
  const version = { id: 7, public_id: 'version-public-id', resource_id: 9, status: 'pending_review' };
  const resource = { id: 9, user_id: 3, resource_kind: 'map', status: 'pending', deleted_at: null };
  const actor = { id: 3, role: 'user' };
  const input = { version_public_id: 'version-public-id', filename: 'map.msav', size_bytes: 123, mime_type: 'application/octet-stream', sha256: 'a'.repeat(64) };

  function make() {
    const sessions = { create: jest.fn((row) => row), save: jest.fn(async (row) => row), findOne: jest.fn() };
    const versions = { findOne: jest.fn().mockResolvedValue(version) };
    const resources = { findOne: jest.fn().mockResolvedValue(resource) };
    const files = { exist: jest.fn().mockResolvedValue(false) };
    const manager = {
      getRepository: jest.fn().mockReturnValue({ findOne: jest.fn() }),
      findOne: jest.fn(), exists: jest.fn().mockResolvedValue(false),
      save: jest.fn(), update: jest.fn(), create: jest.fn((_entity, value) => value),
    };
    const dataSource = { manager: { exists: jest.fn().mockResolvedValue(false) }, transaction: jest.fn(async (callback) => callback(manager)) };
    const res = {
      createUploadSession: jest.fn(), getObject: jest.fn(),
      createBinding: jest.fn().mockResolvedValue({ id: 'binding-1' }), deleteBinding: jest.fn(),
    };
    const service = new ResourceDirectUploadService(sessions as any, versions as any, resources as any, files as any, dataSource as any, res as any);
    return { service, sessions, versions, resources, files, manager, dataSource, res };
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

  it('creates a pending RES file from server-verified metadata and a private binding', async () => {
    const { service, sessions, manager, res } = make();
    const pending = { id: 'session', user_id: 3, resource_version_id: 7, role: 'primary', filename: 'map.msav', size_bytes: 123,
      mime_type: 'application/octet-stream', sha256: 'a'.repeat(64), object_public_id: null,
      resource_file_public_id: null, expires_at: new Date(Date.now() + 60_000) };
    sessions.findOne.mockResolvedValue(pending);
    manager.getRepository.mockReturnValue({ findOne: jest.fn().mockResolvedValue(pending) });
    manager.findOne.mockImplementation(async (entity) => entity.name === 'ResourceVersion' ? version : resource);
    res.getObject.mockResolvedValue({ public_id: 'object', state: 'verified', sha256: 'a'.repeat(64), size_bytes: 123,
      mime_type: 'application/octet-stream', original_filename: 'first-upload.msav' });
    const result = await service.complete('session', 'object', actor);
    expect(result).toMatchObject({ completed: true, file_public_id: expect.any(String) });
    expect(res.createBinding).toHaveBeenCalledWith('object', expect.objectContaining({ visibility: 'private', owner_type: 'resource_file' }));
    expect(manager.save).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      storage_backend: 'res', provider_object_id: 'object', provider_binding_id: 'binding-1',
      storage_key: `sha256:${'a'.repeat(64)}`, availability_status: 'pending',
    }));
  });
});
