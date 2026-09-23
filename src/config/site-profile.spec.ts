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
});
