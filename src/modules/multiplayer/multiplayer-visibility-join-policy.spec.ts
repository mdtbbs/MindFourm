import { SessionPolicyService } from './session-policy.service';
import type { MultiplayerSessionJoinPolicy, MultiplayerSessionVisibility } from '../../entities/multiplayer-session.entity';

const VISIBILITIES: MultiplayerSessionVisibility[] = ['private', 'friends', 'public'];
const JOIN_POLICIES: MultiplayerSessionJoinPolicy[] = ['invite_only', 'friends', 'public'];

interface Viewers {
  /** A user who is not a friend of the owner and has no invite. */
  stranger: number;
  friend: number;
  owner: number;
}

type Viewer = keyof Viewers;

function createPolicy({ ownerAllowsJoin = true, ownerAllowsRequest = true, blocked = false } = {}) {
  const social = {
    isBlockedEither: jest.fn(async (a: number, b: number) => blocked || a === -1 || b === -1),
    canPerform: jest.fn(async (viewer: number, _owner: number, key: string) =>
      key === 'allow_join' ? ownerAllowsJoin : key === 'allow_join_request' ? ownerAllowsRequest : true),
    areFriends: jest.fn(async (viewer: number, owner: number) => viewer === owner || viewer === 2),
  };
  const peers = {
    count: jest.fn().mockResolvedValue(1),
    findOne: jest.fn().mockResolvedValue(null),
  };
  const invites = { findOne: jest.fn().mockResolvedValue(null) };
  const joinRequests = { findOne: jest.fn().mockResolvedValue(null) };
  const policy = new SessionPolicyService(social as any, peers as any, invites as any, joinRequests as any);
  return { policy, social, peers, invites, joinRequests };
}

const VIEWERS: Viewers = { stranger: 7, friend: 2, owner: 1 };

function session(
  visibility: MultiplayerSessionVisibility,
  join_policy: MultiplayerSessionJoinPolicy,
  require_approval = false,
) {
  return {
    id: 'ses_12345678901234567890', owner_user_id: VIEWERS.owner,
    visibility, join_policy, require_approval, max_players: 8,
  } as any;
}

/** Every (visibility, join_policy) pair the product defines. */
const MATRIX = VISIBILITIES.flatMap((visibility) => JOIN_POLICIES.map((join_policy) => ({ visibility, join_policy })));

function label({ visibility, join_policy }: { visibility: string; join_policy: string }) {
  return `${visibility} + ${join_policy}`;
}

describe('Session visibility and join policy are orthogonal', () => {
  it('covers all nine combinations', () => {
    expect(MATRIX).toHaveLength(9);
    expect(MATRIX.map(label).sort()).toEqual([
      'friends + friends', 'friends + invite_only', 'friends + public',
      'private + friends', 'private + invite_only', 'private + public',
      'public + friends', 'public + invite_only', 'public + public',
    ]);
  });

  describe('discovery depends only on visibility', () => {
    // Who can *find* a Session is a pure function of visibility, friendship and
    // membership. The join_policy axis must not move any of these answers.
    const expected: Record<MultiplayerSessionVisibility, Record<Viewer, boolean>> = {
      private: { owner: true, friend: false, stranger: false },
      friends: { owner: true, friend: true, stranger: false },
      public: { owner: true, friend: true, stranger: true },
    };

    for (const { visibility, join_policy } of MATRIX) {
      it(`${label({ visibility, join_policy })}: owner / friend / stranger`, async () => {
        for (const [viewer, viewerId] of Object.entries(VIEWERS) as Array<[Viewer, number]>) {
          const { policy } = createPolicy();
          await expect(policy.canViewSession(viewerId, session(visibility, join_policy)))
            .resolves.toBe(expected[visibility][viewer]);
        }
      });
    }

    it('lets an active peer see the Session at every visibility', async () => {
      for (const { visibility, join_policy } of MATRIX) {
        const { policy } = createPolicy();
        (policy as any).peers.findOne = jest.fn().mockResolvedValue({ id: 'peer' });
        await expect(policy.canViewSession(VIEWERS.stranger, session(visibility, join_policy))).resolves.toBe(true);
      }
    });
  });

  describe('join eligibility depends only on join_policy', () => {
    // For a given join_policy the outcome is identical at all three visibilities.
    // This is the assertion that fails on the retired model, where `private` denied
    // every join no matter what join_policy said.
    const cases: Array<{
      join_policy: MultiplayerSessionJoinPolicy;
      viewer: Viewer;
      via: { viaInviteOrApproval: boolean; viaJoinCode?: boolean };
      denial: string | null;
    }> = [
      { join_policy: 'invite_only', viewer: 'stranger', via: { viaInviteOrApproval: false }, denial: 'SESSION_NOT_JOINABLE' },
      { join_policy: 'invite_only', viewer: 'friend', via: { viaInviteOrApproval: false }, denial: 'SESSION_NOT_JOINABLE' },
      { join_policy: 'invite_only', viewer: 'friend', via: { viaInviteOrApproval: false, viaJoinCode: true }, denial: 'SESSION_NOT_JOINABLE' },
      { join_policy: 'invite_only', viewer: 'stranger', via: { viaInviteOrApproval: true }, denial: null },

      { join_policy: 'friends', viewer: 'stranger', via: { viaInviteOrApproval: false }, denial: 'FRIEND_REQUIRED' },
      { join_policy: 'friends', viewer: 'stranger', via: { viaInviteOrApproval: false, viaJoinCode: true }, denial: 'FRIEND_REQUIRED' },
      { join_policy: 'friends', viewer: 'friend', via: { viaInviteOrApproval: false }, denial: null },
      { join_policy: 'friends', viewer: 'stranger', via: { viaInviteOrApproval: true }, denial: null },

      { join_policy: 'public', viewer: 'stranger', via: { viaInviteOrApproval: false }, denial: null },
      { join_policy: 'public', viewer: 'friend', via: { viaInviteOrApproval: false }, denial: null },
      { join_policy: 'public', viewer: 'owner', via: { viaInviteOrApproval: false }, denial: null },
    ];

    for (const { join_policy, viewer, via, denial } of cases) {
      it(`${join_policy} admits ${viewer} the same way at private / friends / public`, async () => {
        for (const visibility of VISIBILITIES) {
          const { policy } = createPolicy();
          await expect(policy.joinDenialCode(VIEWERS[viewer], session(visibility, join_policy), via))
            .resolves.toBe(denial);
        }
      });
    }
  });

  describe('require_approval layers on top of an eligible join policy', () => {
    for (const { visibility, join_policy } of MATRIX) {
      it(`${label({ visibility, join_policy })} + require_approval`, async () => {
        const gated = session(visibility, join_policy, true);
        const eligibleDirectly = join_policy === 'public';
        const { policy } = createPolicy();

        const direct = await policy.decideJoin(VIEWERS.stranger, gated, { viaInviteOrApproval: false });
        if (eligibleDirectly) {
          expect(direct).toMatchObject({ denial: 'JOIN_REQUEST_REQUIRED', can_join: false, can_request_join: true });
        } else {
          expect(direct.can_join).toBe(false);
          // invite_only has no request path at all; friends only offers one to friends.
          expect(direct.can_request_join).toBe(false);
        }

        // An approved request is an approved path and clears the gate.
        // An approved request is an approved path and clears the gate for every
        // policy — invite_only included, since approval *is* the invite.
        await expect(policy.joinDenialCode(VIEWERS.stranger, gated, { viaInviteOrApproval: true })).resolves.toBeNull();
      });
    }

    it('never offers a join request for invite_only', async () => {
      for (const visibility of VISIBILITIES) {
        const { policy } = createPolicy();
        await expect(policy.joinRequestDenialCode(VIEWERS.friend, session(visibility, 'invite_only', true)))
          .resolves.toBe('SESSION_NOT_JOINABLE');
      }
    });

    it('offers a join request to friends only when the policy is friends or better', async () => {
      for (const visibility of VISIBILITIES) {
        const friendPolicy = createPolicy();
        await expect(friendPolicy.policy.joinRequestDenialCode(VIEWERS.friend, session(visibility, 'friends', true)))
          .resolves.toBeNull();

        const stranger = createPolicy();
        await expect(stranger.policy.joinRequestDenialCode(VIEWERS.stranger, session(visibility, 'friends', true)))
          .resolves.toBe('FRIEND_REQUIRED');
      }
    });
  });

  describe('the entry path is transport, not permission', () => {
    it('does not let a room code satisfy invite_only or friends', async () => {
      for (const visibility of VISIBILITIES) {
        const { policy } = createPolicy();
        await expect(policy.joinDenialCode(VIEWERS.stranger, session(visibility, 'invite_only'), {
          viaInviteOrApproval: false, viaJoinCode: true,
        })).resolves.toBe('SESSION_NOT_JOINABLE');
        await expect(policy.joinDenialCode(VIEWERS.stranger, session(visibility, 'friends'), {
          viaInviteOrApproval: false, viaJoinCode: true,
        })).resolves.toBe('FRIEND_REQUIRED');
      }
    });

    it('makes private + public the hidden-but-joinable room, code or not', async () => {
      // This is the composition that replaces the retired `unlisted` value: the
      // Session stays out of every lobby, yet knowing the entry is enough. The
      // room's own `join_policy = public` outranks the owner's personal
      // `allow_join` default, so the code is a convenience rather than a key.
      const { policy } = createPolicy({ ownerAllowsJoin: false });
      await expect(policy.joinDenialCode(VIEWERS.stranger, session('private', 'public'), { viaInviteOrApproval: false }))
        .resolves.toBeNull();
      await expect(policy.joinDenialCode(VIEWERS.stranger, session('private', 'public'), {
        viaInviteOrApproval: false, viaJoinCode: true,
      })).resolves.toBeNull();
    });

    it('still needs friendship when a room asks for friends, whatever the entry', async () => {
      // `private + friends` stays a friends-only room: the owner's own
      // `allow_join` default is the only thing an entry may clear.
      const { policy } = createPolicy({ ownerAllowsJoin: false });
      await expect(policy.joinDenialCode(VIEWERS.stranger, session('private', 'friends'), { viaInviteOrApproval: false }))
        .resolves.toBe('PRIVACY_DENIED');
      await expect(policy.joinDenialCode(VIEWERS.stranger, session('private', 'friends'), {
        viaInviteOrApproval: false, viaJoinCode: true,
      })).resolves.toBe('FRIEND_REQUIRED');
      await expect(policy.joinDenialCode(VIEWERS.friend, session('private', 'friends'), {
        viaInviteOrApproval: false, viaJoinCode: true,
      })).resolves.toBeNull();
    });

    it('records the same room-code denial for an expired / revoked invite', async () => {
      const { policy, invites } = createPolicy({ ownerAllowsJoin: false });
      // No accepted invite row exists, so an invite_only Session stays closed even
      // with the code in hand.
      invites.findOne.mockResolvedValue(null);
      await expect(policy.joinDenialCode(VIEWERS.stranger, session('private', 'invite_only'), {
        viaInviteOrApproval: false, viaJoinCode: true,
      })).resolves.toBe('SESSION_NOT_JOINABLE');
    });
  });

  it('denies a blocked user at every combination, including public discovery', async () => {
    for (const { visibility, join_policy } of MATRIX) {
      const { policy } = createPolicy({ blocked: true });
      await expect(policy.joinDenialCode(VIEWERS.friend, session(visibility, join_policy), { viaInviteOrApproval: true }))
        .resolves.toBe('USER_BLOCKED');
      await expect(policy.canViewSession(VIEWERS.friend, session(visibility, join_policy))).resolves.toBe(false);
    }
  });

  it('reports capacity before approval for a gated Session', async () => {
    for (const { visibility, join_policy } of MATRIX) {
      const { policy } = createPolicy();
      (policy as any).peers.count = jest.fn().mockResolvedValue(8);
      await expect(policy.joinDenialCode(VIEWERS.stranger, session(visibility, join_policy, true), { viaInviteOrApproval: true }))
        .resolves.toBe('SESSION_FULL');
    }
  });
});
