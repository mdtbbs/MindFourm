import { SiteConfigService } from './site-profile';

describe('SiteConfigService', () => {
  it('defaults to the MDTBBS profile and exposes its module registries', () => {
    const service = new SiteConfigService({ get: jest.fn().mockReturnValue(undefined) } as any);
    expect(service.current.profile).toBe('mdtbbs');
    expect(service.isEnabled('resources')).toBe(true);
    expect(service.current.searchProviders).toContain('game_versions');
  });

  it('rejects profiles that have not been implemented', () => {
    expect(() => new SiteConfigService({ get: jest.fn().mockReturnValue('oldbbs') } as any))
      .toThrow('Unsupported SITE_PROFILE "oldbbs"');
  });

  it('loads the Club profile with its email-only write policy and locales', () => {
    const service = new SiteConfigService({ get: jest.fn().mockReturnValue('mindustry-club') } as any);
    expect(service.current.domain).toBe('mindustry.club');
    expect(service.current.localization).toEqual({ defaultLocale: 'en', supportedLocales: ['en', 'ru', 'ja'] });
    expect(service.current.verification).toEqual({ requireEmail: true, requirePhoneForWrites: false });
    expect(service.isEnabled('phoneVerification')).toBe(false);
  });
});
