import { SocialFriendsPresenceV1Controller } from './presence-v1.controller';

describe('SocialFriendsPresenceV1Controller', () => {
  it('returns null for a friend avatar_url when the source profile omits it', async () => {
    const controller = new SocialFriendsPresenceV1Controller(
      { getFriendsList: jest.fn().mockResolvedValue({
        friends: [{ id: 11, username: 'friend' }], total: 1, page: 1, limit: 50, totalPages: 1,
      }) } as any,
      { getSocialSnapshots: jest.fn().mockResolvedValue(new Map([[11, { status: 'offline', activity: null, last_seen_at: null }]])) } as any,
      {
        canSeeMany: jest.fn().mockResolvedValue(new Map([[11, true]])),
        settingsForMany: jest.fn().mockResolvedValue(new Map()),
      } as any,
      {} as any,
      {
        clientMetadataFor: jest.fn().mockResolvedValue(new Map()),
        actionsForActivities: jest.fn().mockResolvedValue(new Map()),
      } as any,
    );

    const result = await controller.list({}, { user: { id: 7 } });

    expect(result.data[0].user).toHaveProperty('avatar_url', null);
  });
});
