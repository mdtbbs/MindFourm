import { createHash } from 'crypto';
import { MultiplayerService } from './multiplayer.service';
import { ModSyncPlanDto } from './dto/multiplayer.dto';
import { SessionModView } from './mod-sync-plan';

const HASH_A = 'a'.repeat(64);

const hostView: SessionModView = {
  mod_id: 'flood-driver',
  display_name: 'Flood Driver',
  version: '1.2.0',
  sha256: HASH_A,
  required: true,
  resolution_status: 'catalog_verified',
  resource_public_id: '11111111-1111-4111-8111-111111111111',
  resource_version_public_id: '22222222-2222-4222-8222-222222222222',
  file_public_id: '33333333-3333-4333-8333-333333333333',
  file_size_bytes: 2048,
  unresolved_reason: null,
};

const hostRow = {
  mod_id: 'flood-driver', display_name: 'Flood Driver', version: '1.2.0', sha256: HASH_A,
  required: true, resolution_status: 'catalog_verified', resource_id: 11,
  resource_public_id: hostView.resource_public_id, resource_version_id: 22,
  resource_version_public_id: hostView.resource_version_public_id,
  file_public_id: hostView.file_public_id, file_size_bytes: 2048,
};

function buildService(overrides: Record<string, unknown> = {}) {
  const service = Object.create(MultiplayerService.prototype) as any;
  service.requireEnabled = jest.fn().mockResolvedValue(undefined);
  service.settings = { getBoolean: jest.fn().mockResolvedValue(true) };
  service.findActiveSession = jest.fn().mockResolvedValue({
    id: 'ses_12345678901234567890', owner_user_id: 7, mod_pack_version_id: null, is_modded: true, code_hash: null,
    mod_count: 1, mod_syncable_count: 1, game_id: 'mindustry', game_version: null,
    activity_name: 'Survival', visibility: 'public', join_policy: 'public', require_approval: false,
    max_players: 8, status: 'active', expires_at: new Date(Date.now() + 60_000),
  });
  service.activePeer = jest.fn().mockResolvedValue({ id: 'peer-1' });
  service.canViewSession = jest.fn().mockResolvedValue(true);
  service.invites = { findOne: jest.fn().mockResolvedValue(null) };
  service.joinRequests = { findOne: jest.fn().mockResolvedValue(null) };
  service.modCatalog = {
    findSessionMods: jest.fn().mockResolvedValue(new Map([['ses_12345678901234567890', [hostRow]]])),
    packSummaries: jest.fn().mockResolvedValue(new Map()),
    toView: jest.fn().mockReturnValue(hostView),
    viewOfResolved: jest.fn(),
    fileGrantInfo: jest.fn().mockResolvedValue(new Map([
      [hostView.file_public_id!, { fileId: 33, deliveryMode: 'managed' }],
    ])),
  };
  service.downloadGrants = { recordGrant: jest.fn().mockResolvedValue(true) };
  return Object.assign(service, overrides);
}

const request = { headers: { 'user-agent': 'MDTBBSAddon/1.0', 'x-client-version': '1.0.0', 'x-platform': 'desktop' }, ip: '203.0.113.9' };

describe('MultiplayerService mod-sync guards', () => {
  it('rejects create_room requests that send both a Pack ref and an explicit mod list', async () => {
    const service = buildService();
    await expect(service.createSession(7, 'client', {
      game_id: 'mindustry',
      mod_pack_ref: { pack_public_id: 'pack-public-id' },
      mods: [],
    } as any)).rejects.toMatchObject({ status: 400, code: 'SESSION_MODS_INVALID' });
  });

  it('rejects mod input while the runtime switch is off', async () => {
    const service = buildService();
    service.modSyncEnabled = jest.fn().mockResolvedValue(false);
    await expect(service.createSession(7, 'client', {
      game_id: 'mindustry', mods: [{ mod_id: 'flood-driver', sha256: HASH_A }],
    } as any)).rejects.toMatchObject({ status: 403, code: 'FEATURE_DISABLED' });
  });

  it('rejects duplicate installed mod ids before resolving permissions or catalog data', async () => {
    const service = buildService();
    await expect(service.createModSyncPlan(7, 'ses_12345678901234567890', {
      installed_mods: [{ mod_id: 'Flood-Driver' }, { mod_id: 'flood-driver' }],
    } as ModSyncPlanDto, request)).rejects.toMatchObject({ status: 400, code: 'SESSION_MODS_INVALID' });
    expect(service.modCatalog.findSessionMods).not.toHaveBeenCalled();
  });

  it('denies the plan to a user who is neither a peer nor allowed to view the session', async () => {
    const service = buildService();
    service.activePeer = jest.fn().mockResolvedValue(null);
    service.canViewSession = jest.fn().mockResolvedValue(false);
    await expect(service.createModSyncPlan(8, 'ses_12345678901234567890', { installed_mods: [] }, request))
      .rejects.toMatchObject({ status: 403, code: 'SESSION_PERMISSION_DENIED' });
  });

  it('lets an invitee read the plan before joining a session they cannot discover', async () => {
    const service = buildService();
    service.canViewSession = jest.fn().mockResolvedValue(false);
    service.invites.findOne = jest.fn().mockResolvedValue({ id: 'inv-1', status: 'pending', expires_at: new Date(Date.now() + 60_000) });

    const result = await service.createModSyncPlan(7, 'ses_12345678901234567890', { installed_mods: [] }, request);
    expect(result.status).toBe('sync_required');
    expect(service.invites.findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ session_id: 'ses_12345678901234567890', target_user_id: 7 }),
    }));
  });

  it('lets a join-code holder read the plan without exposing the session elsewhere', async () => {
    const service = buildService();
    service.canViewSession = jest.fn().mockResolvedValue(false);
    const session = await service.findActiveSession();
    session.code_hash = createHash('sha256').update('ABCD1234').digest('hex');
    service.findActiveSession = jest.fn().mockResolvedValue(session);

    const result = await service.createModSyncPlan(7, 'ses_12345678901234567890', {
      installed_mods: [], join_code: ' abcd1234 ',
    }, request);
    expect(result.status).toBe('sync_required');
    expect(service.canViewSession).toHaveBeenCalledWith(7, session);
  });

  it('rejects a wrong join code for a private session', async () => {
    const service = buildService();
    service.canViewSession = jest.fn().mockResolvedValue(false);
    const session = await service.findActiveSession();
    session.code_hash = createHash('sha256').update('ABCD1234').digest('hex');
    service.findActiveSession = jest.fn().mockResolvedValue(session);

    await expect(service.createModSyncPlan(7, 'ses_12345678901234567890', {
      installed_mods: [], join_code: 'WRONGCODE',
    }, request)).rejects.toMatchObject({ status: 403, code: 'SESSION_PERMISSION_DENIED' });
  });

  it('issues grants only for verified downloads and returns the stable download URL', async () => {
    const service = buildService();
    const result = await service.createModSyncPlan(7, 'ses_12345678901234567890', { installed_mods: [] }, request);

    expect(result.status).toBe('sync_required');
    expect(result.to_download).toHaveLength(1);
    expect(result.to_download[0]).toMatchObject({
      mod_id: 'flood-driver',
      granted: true,
      download_url: `/api/v1/resources/${hostView.resource_public_id}/versions/${hostView.resource_version_public_id}/files/${hostView.file_public_id}/download`,
    });
    expect(service.downloadGrants.recordGrant).toHaveBeenCalledWith(expect.objectContaining({
      resourceId: 11, versionId: 22, fileId: 33, userId: 7, clientType: 'public-v1-mod-sync', backend: 'managed',
    }), 'user:7');
  });

  it('does not touch download grants when the local profile is already in sync', async () => {
    const service = buildService();
    const result = await service.createModSyncPlan(7, 'ses_12345678901234567890', {
      installed_mods: [{ mod_id: 'flood-driver', sha256: HASH_A, enabled: true }],
    }, request);

    expect(result.status).toBe('ready');
    expect(result.to_download).toEqual([]);
    expect(service.downloadGrants.recordGrant).not.toHaveBeenCalled();
  });
});
