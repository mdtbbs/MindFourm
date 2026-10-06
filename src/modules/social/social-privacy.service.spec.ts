import { SocialPrivacyService } from './social-privacy.service';

describe('SocialPrivacyService', () => {
  it('returns and persists privacy visibility and presence status preferences', async () => {
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
    const preferences = { findOneBy: jest.fn().mockResolvedValue(preference), save: jest.fn(async (value) => value) };
    const service = new SocialPrivacyService(privacy as any, preferences as any);

    await expect(service.get(9)).resolves.toMatchObject({ allow_messages: 'everyone' });
    await expect(service.patch(9, { allow_messages: 'friends', presence_visibility: 'nobody', status: 'dnd' } as any))
      .resolves.toMatchObject({ allow_messages: 'friends', presence_visibility: 'nobody', status: 'dnd' });
    expect(privacy.save).toHaveBeenCalledWith(expect.objectContaining({ allow_messages: 'friends' }));
    expect(preferences.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'dnd' }));
  });
});
