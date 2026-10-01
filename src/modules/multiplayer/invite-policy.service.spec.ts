import { InvitePolicyService } from './invite-policy.service';

describe('InvitePolicyService', () => {
  const session = { id: 'ses_12345678901234567890', max_players: 4 } as any;

  function createPolicy(overrides: Record<string, any> = {}) {
    const social = {
      isBlockedEither: jest.fn().mockResolvedValue(false),
      canPerform: jest.fn().mockResolvedValue(true),
      ...overrides.social,
    };
    const peers = {
      findOne: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(1),
      ...overrides.peers,
    };
    return { policy: new InvitePolicyService(social as any, peers as any), social, peers };
  }

  it('hides self-target invites and denies blocks before privacy', async () => {
    const self = createPolicy();
    await expect(self.policy.denialCode(7, 7, session)).resolves.toBe('INVITE_NOT_FOUND');
    expect(self.social.isBlockedEither).not.toHaveBeenCalled();

    const blocked = createPolicy({ social: { isBlockedEither: jest.fn().mockResolvedValue(true) } });
    await expect(blocked.policy.denialCode(7, 8, session)).resolves.toBe('USER_BLOCKED');
    expect(blocked.social.canPerform).not.toHaveBeenCalled();
  });

  it('enforces recipient privacy, duplicate membership, and session capacity', async () => {
    const privacy = createPolicy({ social: { canPerform: jest.fn().mockResolvedValue(false) } });
    await expect(privacy.policy.denialCode(7, 8, session)).resolves.toBe('PRIVACY_DENIED');
    expect(privacy.peers.findOne).not.toHaveBeenCalled();

    const joined = createPolicy({ peers: { findOne: jest.fn().mockResolvedValue({ id: 'peer' }) } });
    await expect(joined.policy.denialCode(7, 8, session)).resolves.toBe('SESSION_NOT_JOINABLE');
    expect(joined.peers.count).not.toHaveBeenCalled();

    const full = createPolicy({ peers: { count: jest.fn().mockResolvedValue(4) } });
    await expect(full.policy.denialCode(7, 8, session)).resolves.toBe('SESSION_FULL');
  });
});
