import { strict as assert } from 'node:assert';
import {
  isValidMainlandPhone,
  maskMainlandPhone,
} from '../../frontend/src/lib/phone-verification/phone';
import { getSafePhoneVerificationRedirect } from '../../frontend/src/lib/phone-verification/redirect';

describe('phone verification helpers', () => {
  it('validates mainland mobile numbers', () => {
    expect(isValidMainlandPhone('13800138000')).toBe(true);
    expect(isValidMainlandPhone('12800138000')).toBe(false);
    expect(isValidMainlandPhone('1380013800')).toBe(false);
    expect(isValidMainlandPhone('138001380000')).toBe(false);
  });

  it('masks a valid-length phone number without exposing the middle digits', () => {
    expect(maskMainlandPhone('13800138000')).toBe('138 **** 8000');
    expect(maskMainlandPhone('123')).toBe('123');
  });

  it('keeps verification redirects same-origin', () => {
    assert.equal(getSafePhoneVerificationRedirect('/posts/new'), '/posts/new');
    assert.equal(getSafePhoneVerificationRedirect('/resources/upload?kind=map'), '/resources/upload?kind=map');
    assert.equal(getSafePhoneVerificationRedirect(null), '/');
    assert.equal(getSafePhoneVerificationRedirect('//evil.example'), '/');
    assert.equal(getSafePhoneVerificationRedirect('https://evil.example'), '/');
    assert.equal(getSafePhoneVerificationRedirect('\\evil.example'), '/');
  });
});
