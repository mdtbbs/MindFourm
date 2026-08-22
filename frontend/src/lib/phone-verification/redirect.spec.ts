import { strict as assert } from "node:assert";
import { getSafePhoneVerificationRedirect } from "./redirect";

assert.equal(getSafePhoneVerificationRedirect("/posts/new"), "/posts/new");
assert.equal(getSafePhoneVerificationRedirect(null), "/");
assert.equal(getSafePhoneVerificationRedirect("//evil.com"), "/");
assert.equal(getSafePhoneVerificationRedirect("https://evil.com"), "/");
assert.equal(getSafePhoneVerificationRedirect("\\evil.com"), "/");
