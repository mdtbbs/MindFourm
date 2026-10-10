import { secretsMatch } from './secret-compare.util';

describe('secretsMatch', () => {
  it('accepts identical secrets', () => {
    expect(secretsMatch('s3cret-token', 's3cret-token')).toBe(true);
  });

  it('rejects a wrong secret of the same length', () => {
    expect(secretsMatch('s3cret-tokeN', 's3cret-token')).toBe(false);
  });

  it('rejects differing lengths without throwing', () => {
    // timingSafeEqual throws on a length mismatch; the helper must not leak that as a 500.
    expect(() => secretsMatch('short', 'a-much-longer-secret')).not.toThrow();
    expect(secretsMatch('short', 'a-much-longer-secret')).toBe(false);
    expect(secretsMatch('', 'non-empty')).toBe(false);
  });

  it('treats two empty strings as a match', () => {
    expect(secretsMatch('', '')).toBe(true);
  });

  it('compares bytes, not characters', () => {
    // Multi-byte characters are the case where a naive `length` check would disagree
    // with the buffer comparison.
    expect(secretsMatch('密码', '密码')).toBe(true);
    expect(secretsMatch('密码', '密码!')).toBe(false);
  });
});
