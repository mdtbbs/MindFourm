import { joinMindAuthApiUrl } from './mindauth-url.util';

describe('joinMindAuthApiUrl', () => {
  it('adds the /api prefix when the base URL does not include it', () => {
    expect(joinMindAuthApiUrl('http://localhost:4001', '/token')).toBe('http://localhost:4001/api/token');
  });

  it('does not duplicate /api when the base URL already includes it', () => {
    expect(joinMindAuthApiUrl('http://localhost:4001/api', '/userinfo')).toBe('http://localhost:4001/api/userinfo');
  });
});
