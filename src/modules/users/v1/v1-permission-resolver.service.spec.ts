import { V1PermissionResolverService } from './v1-permission-resolver.service';

describe('V1PermissionResolverService', () => {
  const user = { id: 19, phone_verified: true };
  let settings: { getBoolean: jest.Mock };
  let auth: { checkNeedsTermsAcceptance: jest.Mock };
  let bans: { isActive: jest.Mock };
  let service: V1PermissionResolverService;

  beforeEach(() => {
    settings = { getBoolean: jest.fn().mockResolvedValue(true) };
    auth = { checkNeedsTermsAcceptance: jest.fn().mockResolvedValue(false) };
    bans = { isActive: jest.fn().mockResolvedValue(false) };
    service = new V1PermissionResolverService(settings as any, auth as any, bans as any);
  });

  it('reports an active user ban for write and message permissions', async () => {
    bans.isActive.mockResolvedValue(true);

    await expect(service.resolve(user)).resolves.toMatchObject({
      thread_create: { allowed: false, reason: 'USER_BANNED' },
      reply_create: { allowed: false, reason: 'USER_BANNED' },
      resource_upload: { allowed: false, reason: 'USER_BANNED' },
      message_read: { allowed: false, reason: 'USER_BANNED' },
    });
  });

  it('reports phone verification and terms gates using stable reason codes', async () => {
    auth.checkNeedsTermsAcceptance.mockResolvedValue(true);
    await expect(service.resolve({ ...user, phone_verified: false })).resolves.toMatchObject({
      thread_create: { allowed: false, reason: 'TERMS_ACCEPTANCE_REQUIRED' },
    });

    auth.checkNeedsTermsAcceptance.mockResolvedValue(false);
    await expect(service.resolve({ ...user, phone_verified: false })).resolves.toMatchObject({
      thread_create: { allowed: false, reason: 'PHONE_VERIFICATION_REQUIRED' },
      resource_upload: { allowed: false, reason: 'PHONE_VERIFICATION_REQUIRED' },
    });
  });

  it('reports disabled features and keeps third-party messaging opt-in', async () => {
    settings.getBoolean.mockImplementation(async (key: string) => ![
      'feature_resources_v1_upload_enabled', 'feature_messages_third_party_access_enabled',
    ].includes(key));
    const result = await service.resolve(user, { source: 'mindauth_oauth', partyType: 'third_party' });
    expect(result.resource_upload).toEqual({ allowed: false, reason: 'RESOURCE_UPLOAD_DISABLED' });
    expect(result.message_read).toEqual({ allowed: false, reason: 'THIRD_PARTY_ACCESS_DISABLED' });
  });
});
