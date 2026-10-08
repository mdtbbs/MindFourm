import { strict as assert } from "node:assert";
import { getSafePhoneVerificationRedirect } from "./redirect";

describe('getSafePhoneVerificationRedirect', () => {
  it('keeps internal paths and falls back to the site root', () => {
    assert.equal(getSafePhoneVerificationRedirect("/posts/new"), "/posts/new");
    assert.equal(getSafePhoneVerificationRedirect(null), "/");
  });

  it('rejects protocol-relative, absolute and backslash-escaped redirects', () => {
    assert.equal(getSafePhoneVerificationRedirect("//evil.com"), "/");
    assert.equal(getSafePhoneVerificationRedirect("https://evil.com"), "/");
    assert.equal(getSafePhoneVerificationRedirect("\\evil.com"), "/");
  });
});
