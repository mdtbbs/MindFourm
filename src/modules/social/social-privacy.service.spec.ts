import { SocialPrivacyService } from './social-privacy.service';

describe('SocialPrivacyService', () => {
  it('returns and persists the inbound private-message visibility setting', async () => {
    const settings = {
      user_id: 9,
      presence_visibility: 'friends',
      activity_visibility: 'friends',
      allow_join: 'friends',
      allow_join_request: 'friends',
      allow_invites: 'friends',
      allow_messages: 'everyone',
      show_last_seen: true,
    };
    const privacy = {
      findOneBy: jest.fn().mockResolvedValue(settings),
      save: jest.fn(async (value) => value),
    };
    const preference = { user_id: 9, status: 'online' };
    const preferences = { findOneBy: jest.fn().mockResolvedValue(preference) };
    const service = new SocialPrivacyService(privacy as any, preferences as any);

    await expect(service.get(9)).resolves.toMatchObject({ allow_messages: 'everyone' });
    await expect(service.patch(9, { allow_messages: 'friends' } as any)).resolves.toMatchObject({ allow_messages: 'friends' });
    expect(privacy.save).toHaveBeenCalledWith(expect.objectContaining({ allow_messages: 'friends' }));
  });
});
