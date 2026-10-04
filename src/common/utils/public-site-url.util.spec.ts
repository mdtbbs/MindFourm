import {
  isLocalOrPrivateHostname,
  normalizeSiteUrl,
  resolvePublicSiteUrl,
  validateConfiguredPublicSiteUrl,
} from './public-site-url.util';

describe('public site URL utilities', () => {
  it('normalizes trailing slashes without changing a deployment subpath', () => {
    expect(normalizeSiteUrl('https://example.com/forum/')).toBe('https://example.com/forum');
  });

  it.each([
    'localhost',
    'foo.localhost',
    '127.0.0.1',
    '127.20.30.40',
    '10.0.0.5',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.5',
    '169.254.10.2',
    '::1',
    'fc00::1',
    'fe80::1',
  ])('recognizes local/private host %s', (host) => {
    expect(isLocalOrPrivateHostname(host)).toBe(true);
  });

  it('rejects loopback and insecure production URLs', () => {
    expect(() => validateConfiguredPublicSiteUrl('http://127.0.0.1:3000', 'production')).toThrow();
    expect(() => validateConfiguredPublicSiteUrl('http://example.com', 'production')).toThrow();
  });

  it('keeps localhost available for development', () => {
    expect(validateConfiguredPublicSiteUrl('http://localhost:3000', 'development'))
      .toBe('http://localhost:3000');
  });

  it('ignores a stale database localhost value and uses the public environment URL', () => {
    expect(resolvePublicSiteUrl({
      configuredUrl: 'http://127.0.0.1:3000',
      envUrl: 'https://mdtbbs.cn',
      profileDomain: 'mdtbbs.cn',
      nodeEnv: 'production',
    })).toBe('https://mdtbbs.cn');
  });

  it('falls back to the site profile domain in production', () => {
    expect(resolvePublicSiteUrl({
      configuredUrl: 'http://localhost:3000',
      profileDomain: 'mindustry.club',
      nodeEnv: 'production',
    })).toBe('https://mindustry.club');
  });
});
