import {
  getClientIp,
  getClientIpSource,
  getClientRegion,
  normalizeClientIp,
} from './client-context.util';

describe('client context', () => {
  it('prefers ESA ali-real-client-ip over a CDN X-Forwarded-For address', () => {
    const request = {
      headers: {
        'ali-real-client-ip': '198.51.100.7',
        'x-forwarded-for': '203.0.113.44, 10.0.0.1',
      },
      ip: '10.0.0.1',
    };

    expect(getClientIp(request)).toBe('198.51.100.7');
    expect(getClientIpSource(request)).toBe('ali-real-client-ip');
  });

  it('skips an invalid ESA IP and falls back to the next valid trusted header', () => {
    const request = {
      headers: {
        'ali-real-client-ip': 'not-an-ip',
        'x-real-ip': '2001:db8::1',
      },
    };

    expect(getClientIp(request)).toBe('2001:db8::1');
    expect(getClientIpSource(request)).toBe('x-real-ip');
  });

  it('uses ESA country when no more specific location header is available', () => {
    expect(getClientRegion({ headers: { 'ali-ip-country': 'cn' } })).toBe('CN');
    expect(getClientRegion({ headers: { 'ali-ip-country': 'china' } })).toBeNull();
  });

  it('normalizes valid addresses and refuses arbitrary header values', () => {
    expect(normalizeClientIp('[2001:db8::2]:443')).toBe('2001:db8::2');
    expect(normalizeClientIp('::ffff:198.51.100.8')).toBe('198.51.100.8');
    expect(normalizeClientIp('not-an-ip')).toBe('');
  });
});
