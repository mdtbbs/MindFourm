import { PresencePolicyService } from './presence-policy.service';

describe('PresencePolicyService', () => {
  it('routes batch visibility checks through the shared Social policy', async () => {
    const social = {
      canSeeMany: jest.fn().mockResolvedValue(new Map([[2, true]])),
      canSeeFromManyViewers: jest.fn().mockResolvedValue(new Map([[2, false]])),
    };
    const policy = new PresencePolicyService(social as any);

    await expect(policy.canSeeMany(1, [2], 'presence_visibility')).resolves.toEqual(new Map([[2, true]]));
    await expect(policy.canSeeFromManyViewers(2, [1], 'activity_visibility')).resolves.toEqual(new Map([[2, false]]));
    expect(social.canSeeMany).toHaveBeenCalledWith(1, [2], 'presence_visibility');
    expect(social.canSeeFromManyViewers).toHaveBeenCalledWith(2, [1], 'activity_visibility');
  });
});
