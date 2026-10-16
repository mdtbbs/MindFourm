import { SessionPolicyService } from './session-policy.service';

describe('SessionPolicyService', () => {
  const session = {
    id: 'ses_12345678901234567890', owner_user_id: 9,
    visibility: 'friends', join_policy: 'friends', require_approval: false, max_players: 4,
  } as any;

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

  // The ladder probes its inputs in one parallel round-trip, so these assert the
  // *decision* precedence (blockout outranks privacy outranks policy) rather than
  // which lookup happened first.
  it('reports the block before any other denial reason', async () => {
    const { policy } = createPolicy({
      social: {
        isBlockedEither: jest.fn().mockResolvedValue(true),
        canPerform: jest.fn().mockResolvedValue(false),
        areFriends: jest.fn().mockResolvedValue(false),
      },
      peers: { count: jest.fn().mockResolvedValue(99) },
    });

    await expect(policy.joinDenialCode(7, { ...session, join_policy: 'invite_only' }, { viaInviteOrApproval: false }))
      .resolves.toBe('USER_BLOCKED');
  });

  it('reports privacy before join policy and capacity before approval', async () => {
    const privatePolicy = createPolicy({ social: { canPerform: jest.fn().mockResolvedValue(false) } });
    await expect(privatePolicy.policy.joinDenialCode(7, { ...session, join_policy: 'invite_only' }, { viaInviteOrApproval: false }))
      .resolves.toBe('PRIVACY_DENIED');

    const fullPolicy = createPolicy({ peers: { count: jest.fn().mockResolvedValue(4) } });
    await expect(fullPolicy.policy.joinDenialCode(7, session, { viaInviteOrApproval: true })).resolves.toBe('SESSION_FULL');
  });

  it('never lets visibility alone deny a join', async () => {
    // The same private Session is joinable or not purely by join_policy: the
    // retired model rejected `private` outright, which is the coupling this
    // issue removes.
    const ownerAllows = createPolicy({ social: { canPerform: jest.fn().mockResolvedValue(true) } });
    await expect(ownerAllows.policy.joinDenialCode(7, { ...session, visibility: 'private', join_policy: 'public' }, { viaInviteOrApproval: false }))
      .resolves.toBeNull();

    const invited = createPolicy({ social: { canPerform: jest.fn().mockResolvedValue(false) } });
    await expect(invited.policy.joinDenialCode(7, { ...session, visibility: 'private' }, { viaInviteOrApproval: true }))
      .resolves.toBeNull();
  });

  it('requires an accepted invite for invite_only regardless of the entry path', async () => {
    const { policy } = createPolicy();
    const inviteOnly = { ...session, join_policy: 'invite_only', visibility: 'public' };

    await expect(policy.joinDenialCode(7, inviteOnly, { viaInviteOrApproval: false })).resolves.toBe('SESSION_NOT_JOINABLE');
    // A room code locates the Session; it does not confer eligibility.
    await expect(policy.joinDenialCode(7, inviteOnly, { viaInviteOrApproval: false, viaJoinCode: true })).resolves.toBe('SESSION_NOT_JOINABLE');
    await expect(policy.joinDenialCode(7, inviteOnly, { viaInviteOrApproval: true })).resolves.toBeNull();
  });

  it('requires friendship when join_policy is friends, then accepts an approved path', async () => {
    const { policy } = createPolicy();
    const friendsOnly = { ...session, join_policy: 'friends' };

    await expect(policy.joinDenialCode(7, friendsOnly, { viaInviteOrApproval: false })).resolves.toBe('FRIEND_REQUIRED');
    await expect(policy.joinDenialCode(7, friendsOnly, { viaInviteOrApproval: false, viaJoinCode: true })).resolves.toBe('FRIEND_REQUIRED');
    await expect(policy.joinDenialCode(7, friendsOnly, { viaInviteOrApproval: true })).resolves.toBeNull();
  });

  it('defers to require_approval on top of an otherwise eligible policy', async () => {
    const { policy } = createPolicy();
    const gated = { ...session, join_policy: 'public', require_approval: true, visibility: 'public' };

    const decision = await policy.decideJoin(7, gated, { viaInviteOrApproval: false });
    expect(decision).toMatchObject({ denial: 'JOIN_REQUEST_REQUIRED', can_join: false, can_request_join: true });

    await expect(policy.joinDenialCode(7, gated, { viaInviteOrApproval: true })).resolves.toBeNull();
  });

  it('allows an already-pending join request to be retried without another capacity check', async () => {
    const existing = { id: 'jrq_pending', expires_at: new Date(Date.now() + 60_000) };
    const { policy, peers, joinRequests } = createPolicy({
      peers: { findOne: jest.fn().mockResolvedValue(null), count: jest.fn().mockResolvedValue(4) },
      joinRequests: { findOne: jest.fn().mockResolvedValue(existing) },
    });

    await expect(policy.joinRequestDenialCode(7, { ...session, join_policy: 'public', require_approval: true })).resolves.toBeNull();
    expect(joinRequests.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: 'pending' }) }));
    expect(peers.count).not.toHaveBeenCalled();
  });

  it('rejects join requests when approval is off, when already joined, and when full', async () => {
    const approvalOff = createPolicy();
    await expect(approvalOff.policy.joinRequestDenialCode(7, session)).resolves.toBe('SESSION_NOT_JOINABLE');

    const activePeer = createPolicy({ peers: { findOne: jest.fn().mockResolvedValue({ id: 'peer' }) } });
    await expect(activePeer.policy.joinRequestDenialCode(7, { ...session, join_policy: 'public', require_approval: true }))
      .resolves.toBe('SESSION_NOT_JOINABLE');

    const full = createPolicy({ peers: { findOne: jest.fn().mockResolvedValue(null), count: jest.fn().mockResolvedValue(4) } });
    await expect(full.policy.joinRequestDenialCode(7, { ...session, join_policy: 'public', require_approval: true }))
      .resolves.toBe('SESSION_FULL');
  });

  it('never issues a join request for invite_only, even with approval enabled', async () => {
    const { policy } = createPolicy();
    await expect(policy.joinRequestDenialCode(7, { ...session, join_policy: 'invite_only', require_approval: true }))
      .resolves.toBe('SESSION_NOT_JOINABLE');
  });

  it('treats an active peer and the owner as discoverable at every visibility', async () => {
    for (const visibility of ['private', 'friends', 'public'] as const) {
      const active = createPolicy({ peers: { findOne: jest.fn().mockResolvedValue({ id: 'peer' }) } });
      await expect(active.policy.canViewSession(7, { ...session, visibility })).resolves.toBe(true);

      const viewerOwner = createPolicy();
      await expect(viewerOwner.policy.canViewSession(9, { ...session, visibility })).resolves.toBe(true);
    }
  });

  it('hides private sessions from everyone else while respecting blocks and friendship', async () => {
    const blocked = createPolicy({ social: { isBlockedEither: jest.fn().mockResolvedValue(true) } });
    await expect(blocked.policy.canViewSession(7, session)).resolves.toBe(false);

    const stranger = createPolicy();
    await expect(stranger.policy.canViewSession(7, { ...session, visibility: 'private' })).resolves.toBe(false);
    await expect(stranger.policy.canViewSession(7, { ...session, visibility: 'friends' })).resolves.toBe(false);
    await expect(stranger.policy.canViewSession(7, { ...session, visibility: 'public' })).resolves.toBe(true);

    const friend = createPolicy({ social: { areFriends: jest.fn().mockResolvedValue(true) } });
    await expect(friend.policy.canViewSession(7, { ...session, visibility: 'friends' })).resolves.toBe(true);
  });
});
