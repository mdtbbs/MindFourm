import { GameContentUploadSessionService } from './game-content-upload-session.service';

describe('GameContentUploadSessionService', () => {
  function setup() {
    const rows = new Map<string, any>();
    const repo = {
      create: jest.fn((value) => ({ ...value })),
      save: jest.fn(async (value) => { rows.set(value.id, { ...value }); return rows.get(value.id); }),
      findOne: jest.fn(async ({ where }) => {
        const row = rows.get(where.id);
        return row && row.user_id === where.user_id ? { ...row } : null;
      }),
      findOneOrFail: jest.fn(async ({ where }) => rows.get(where.id)),
      update: jest.fn(async (where, patch) => {
        const row = rows.get(where.id);
        if (!row || (where.status && row.status !== where.status)) return { affected: 0 };
        Object.assign(row, patch);
        return { affected: 1 };
      }),
      find: jest.fn(async () => [...rows.values()].filter((row) => row.status === 'uploaded')),
      count: jest.fn().mockResolvedValue(0),
    };
    const storage = { removeManaged: jest.fn().mockResolvedValue(true), cleanupStaleIncomingUploads: jest.fn().mockResolvedValue(0) };
    const previews = { readPreviewKey: jest.fn().mockResolvedValue(Buffer.from('preview')), removePreviewKey: jest.fn().mockResolvedValue(undefined) };
    const resources = { createQueryBuilder: jest.fn(() => ({ select: jest.fn().mockReturnThis(), withDeleted: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), addSelect: jest.fn().mockReturnThis(), getOne: jest.fn().mockResolvedValue(null) })) };
    const service = new GameContentUploadSessionService(repo as any, resources as any, storage as any, previews as any);
    return { service, repo, rows, storage, previews, resources };
  }

  const input = { user_id: 8, filename: 'map.msav', mime_type: 'application/octet-stream', actual_size: 1234, expected_sha256: 'a'.repeat(64), actual_sha256: 'a'.repeat(64), storage_key: '/uploads/.quarantine/resources/map.msav', preview_key: 'resources/map/aa/' + 'a'.repeat(64) + '/preview.png', parser_version: 'renderer-1', renderer_metadata: { width: 10, height: 8 } };

  it('persists an opaque UUID session that a newly created service instance can recover', async () => {
    const first = setup();
    const created = await first.service.create(input as any);
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/i);
    const restarted = new GameContentUploadSessionService(first.repo as any, first.resources as any, first.storage as any, first.previews as any);
    await expect(restarted.getOwned(created.id, 8)).resolves.toMatchObject({ status: 'uploaded', storage_key: input.storage_key, actual_sha256: input.actual_sha256 });
    await expect(restarted.getOwned(created.id, 9)).rejects.toThrow('上传会话不存在');
  });

  it('claims once and persists the completed Resource reference for retries', async () => {
    const { service, rows } = setup();
    const session = await service.create(input as any);
    await expect(service.claim(session.id, 8)).resolves.toBe(true);
    await expect(service.claim(session.id, 8)).resolves.toBe(false);
    await service.setCompleted(session.id, 55);
    await expect(service.getOwned(session.id, 8)).resolves.toMatchObject({ status: 'completed', resource_id: 55 });
  });

  it('marks expired sessions and removes both the quarantined file and parsed preview', async () => {
    const { service, rows, storage, previews } = setup();
    const session = await service.create(input as any);
    const row = rows.get(session.id);
    row.expires_at = new Date(Date.now() - 1000);
    expect(await service.cleanupExpired()).toBe(1);
    expect(rows.get(session.id).status).toBe('expired');
    expect(storage.removeManaged).toHaveBeenCalledWith(input.storage_key);
    expect(previews.removePreviewKey).toHaveBeenCalledWith(input.preview_key);
  });
});
