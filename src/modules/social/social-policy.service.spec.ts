import { SocialPolicyService } from './social-policy.service';

describe('SocialPolicyService', () => {
  const makeService = () => {
    const friendships = { find: jest.fn(), exists: jest.fn() };
    const blocks = { find: jest.fn(), exists: jest.fn() };
    const privacy = { findBy: jest.fn(), createQueryBuilder: jest.fn() };
    return { service: new SocialPolicyService(friendships as any, blocks as any, privacy as any), friendships, blocks, privacy };
  };

  it('lets an explicit block override an everyone privacy setting in a batch', async () => {
    const { service, friendships, blocks, privacy } = makeService();
    privacy.findBy.mockResolvedValue([
      { user_id: 10, presence_visibility: 'everyone', allow_join: 'everyone' },
      { user_id: 11, presence_visibility: 'everyone', allow_join: 'everyone' },
    ]);
    friendships.find.mockResolvedValue([{ requester_id: 1, addressee_id: 10, status: 'accepted' }]);
    blocks.find.mockResolvedValue([{ blocker_id: 11, blocked_id: 1 }]);

    const presence = await service.canSeeMany(1, [10, 11], 'presence_visibility');
    const join = await service.canPerformMany(1, [10, 11], 'allow_join');

    expect(presence.get(10)).toBe(true);
    expect(presence.get(11)).toBe(false);
    expect(join.get(10)).toBe(true);
    expect(join.get(11)).toBe(false);
    expect(friendships.find).toHaveBeenCalledTimes(2);
    expect(blocks.find).toHaveBeenCalledTimes(2);
  });

  it('uses friends as the default and returns one bounded settings read for missing records', async () => {
    const { service, friendships, blocks, privacy } = makeService();
    privacy.findBy.mockResolvedValue([]);
    const insert = { execute: jest.fn().mockResolvedValue({}) };
    const builder = { insert: () => builder, orIgnore: () => builder, values: () => builder, execute: insert.execute };
    privacy.createQueryBuilder.mockReturnValue(builder);
    privacy.findBy.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { user_id: 10, presence_visibility: 'friends', allow_invites: 'friends' },
      { user_id: 11, presence_visibility: 'friends', allow_invites: 'friends' },
    ]);
    friendships.find.mockResolvedValue([{ requester_id: 1, addressee_id: 10, status: 'accepted' }]);
    blocks.find.mockResolvedValue([]);

    const result = await service.canSeeMany(1, [10, 11], 'presence_visibility');

    expect(result.get(10)).toBe(true);
    expect(result.get(11)).toBe(false);
    expect(insert.execute).toHaveBeenCalledTimes(1);
  });
});
