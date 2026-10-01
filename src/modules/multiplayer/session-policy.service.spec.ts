import { SessionPolicyService } from './session-policy.service';

describe('SessionPolicyService', () => {
  const session = { id: 'ses_12345678901234567890', owner_user_id: 9, visibility: 'friends', join_policy: 'open', max_players: 4 } as any;

  function createPolicy(overrides: Record<string, any> = {}) {
    const social = {
      isBlockedEither: jest.fn().mockResolvedValue(false),
      canPerform: jest.fn().mockResolvedValue(true),
      areFriends: jest.fn().mockResolvedValue(false),
      ...overrides.social,
    };
    const peers = {
      count: jest.fn().mockResolvedValue(1),
      findOne: jest.fn().mockResolvedValue(null),
      ...overrides.peers,
    };
    const invites = { findOne: jest.fn().mockResolvedValue(null), ...overrides.invites };
    const joinRequests = { findOne: jest.fn().mockResolvedValue(null), ...overrides.joinRequests };
    return {
      policy: new SessionPolicyService(social as any, peers as any, invites as any, joinRequests as any),
      social, peers, invites, joinRequests,
    };
  }

  it('checks block before privacy or friendship policy', async () => {
    const { policy, social } = createPolicy({ social: { isBlockedEither: jest.fn().mockResolvedValue(true) } });

    await expect(policy.joinDenialCode(7, session, { viaInviteOrApproval: false })).resolves.toBe('USER_BLOCKED');
    expect(social.canPerform).not.toHaveBeenCalled();
    expect(social.areFriends).not.toHaveBeenCalled();
  });

  it('denies by privacy before session friendship policy and reports capacity', async () => {
    const privatePolicy = createPolicy({ social: { canPerform: jest.fn().mockResolvedValue(false) } });
    await expect(privatePolicy.policy.joinDenialCode(7, session, { viaInviteOrApproval: false })).resolves.toBe('PRIVACY_DENIED');
    expect(privatePolicy.social.areFriends).not.toHaveBeenCalled();

    const fullPolicy = createPolicy({ peers: { count: jest.fn().mockResolvedValue(4) } });
    await expect(fullPolicy.policy.joinDenialCode(7, { ...session, visibility: 'private' }, { viaInviteOrApproval: true })).resolves.toBe('SESSION_FULL');
  });

  it('allows an already-pending join request to be retried without another capacity check', async () => {
    const existing = { id: 'jrq_pending', expires_at: new Date(Date.now() + 60_000) };
    const { policy, peers, joinRequests } = createPolicy({
      peers: { findOne: jest.fn().mockResolvedValue(null), count: jest.fn().mockResolvedValue(4) },
      joinRequests: { findOne: jest.fn().mockResolvedValue(existing) },
    });

    await expect(policy.joinRequestDenialCode(7, { ...session, join_policy: 'request' })).resolves.toBeNull();
    expect(joinRequests.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: 'pending' }) }));
    expect(peers.count).not.toHaveBeenCalled();
  });

  it('rejects join requests for the wrong policy, active peers, and full sessions', async () => {
    const wrongPolicy = createPolicy();
    await expect(wrongPolicy.policy.joinRequestDenialCode(7, session)).resolves.toBe('SESSION_NOT_JOINABLE');

    const activePeer = createPolicy({ peers: { findOne: jest.fn().mockResolvedValue({ id: 'peer' }) } });
    await expect(activePeer.policy.joinRequestDenialCode(7, { ...session, join_policy: 'request' })).resolves.toBe('SESSION_NOT_JOINABLE');

    const full = createPolicy({ peers: { findOne: jest.fn().mockResolvedValue(null), count: jest.fn().mockResolvedValue(4) } });
    await expect(full.policy.joinRequestDenialCode(7, { ...session, join_policy: 'request' })).resolves.toBe('SESSION_FULL');
  });

  it('hides private and unlisted sessions while respecting blocks and active membership', async () => {
    const blocked = createPolicy({ social: { isBlockedEither: jest.fn().mockResolvedValue(true) } });
    await expect(blocked.policy.canViewSession(7, session)).resolves.toBe(false);

    const unlisted = createPolicy();
    await expect(unlisted.policy.canViewSession(7, { ...session, visibility: 'unlisted' })).resolves.toBe(false);

    const active = createPolicy({ peers: { findOne: jest.fn().mockResolvedValue({ id: 'peer' }) } });
    await expect(active.policy.canViewSession(7, { ...session, visibility: 'private' })).resolves.toBe(true);
  });
});
