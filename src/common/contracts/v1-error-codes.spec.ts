import { lookupV1ErrorCode, getAllV1ErrorCodes, V1_ERROR_CODES } from './v1-error-codes';
import { apiV1Error, v1ErrorCodeAnchor, v1ErrorDocumentationUrl } from './api-v1.contract';

describe('V1 Error Code Registry', () => {
  it('looks up a known error code', () => {
    const def = lookupV1ErrorCode('RESOURCE_NOT_FOUND');
    expect(def).not.toBeNull();
    expect(def!.httpStatus).toBe(404);
    expect(def!.retryable).toBe(false);
  });

  it('registers the developer documentation not-found code used by documentation_url', () => {
    expect(lookupV1ErrorCode('DOC_NOT_FOUND')).toMatchObject({ httpStatus: 404, retryable: false });
    expect(v1ErrorDocumentationUrl('DOC_NOT_FOUND')).toBe('https://mdtbbs.cn/api/v1/docs/errors#doc-not-found');
  });

  it('registers stable codes emitted by the public V1 endpoints', () => {
    for (const code of [
      'CONTENT_REQUIRED', 'CONTENT_TOO_LARGE', 'INVALID_BLUEPRINT', 'INVALID_MAP',
      'LANLINK_UNAVAILABLE', 'LANLINK_UPSTREAM_INVALID', 'MESSAGING_DISABLED',
      'NOTICE_NOT_FOUND', 'REPLIES_UNAVAILABLE', 'RESOURCE_UPLOAD_DISABLED',
      'SEARCH_UNAVAILABLE', 'TERMS_ACCEPTANCE_REQUIRED', 'THIRD_PARTY_ACCESS_DISABLED', 'USER_BANNED',
    ]) {
      expect(lookupV1ErrorCode(code)).not.toBeNull();
    }
  });

  it('returns null for unknown codes', () => {
    expect(lookupV1ErrorCode('NONEXISTENT_CODE')).toBeNull();
  });

  it('returns all registered error codes', () => {
    const all = getAllV1ErrorCodes();
    expect(all.length).toBe(Object.keys(V1_ERROR_CODES).length);
    expect(all.length).toBeGreaterThan(10);
  });

  it('has unique codes', () => {
    const codes = getAllV1ErrorCodes().map(e => e.code);
    const unique = new Set(codes);
    expect(unique.size).toBe(codes.length);
  });

  it('registers stable Social Presence and Multiplayer error codes', () => {
    for (const code of [
      'FRIEND_REQUIRED', 'USER_BLOCKED', 'PRIVACY_DENIED', 'PRESENCE_CONNECTION_NOT_FOUND',
      'SESSION_NOT_FOUND', 'SESSION_FULL', 'PEER_RESUME_INVALID', 'CANDIDATE_LIMIT_REACHED',
      'INVITE_EXPIRED', 'JOIN_REQUEST_EXPIRED', 'JOIN_INTENT_CONSUMED', 'RELAY_UNAVAILABLE',
      'CLIENT_CAPABILITY_NOT_APPROVED', 'RATE_LIMITED',
    ]) expect(lookupV1ErrorCode(code)).not.toBeNull();
  });

  it('registers stable Cloud Saves API error codes', () => {
    for (const code of ['CLOUD_SAVES_DISABLED', 'SAVE_NOT_FOUND', 'SAVE_QUOTA_EXCEEDED', 'SAVE_CONFLICT',
      'SAVE_BASE_SNAPSHOT_INVALID', 'SAVE_UPLOAD_CHECKSUM_MISMATCH', 'SAVE_CURRENT_SNAPSHOT_DELETE_FORBIDDEN',
      'SAVE_STORAGE_UNAVAILABLE', 'SAVE_INVALID_HASH', 'SAVE_INVALID_METADATA']) {
      expect(lookupV1ErrorCode(code)).not.toBeNull();
    }
  });

  it('all codes have required fields', () => {
    for (const def of getAllV1ErrorCodes()) {
      expect(def.code).toBeTruthy();
      expect(def.httpStatus).toBeGreaterThanOrEqual(0);
      expect(typeof def.retryable).toBe('boolean');
      expect(def.defaultMessage).toBeTruthy();
      expect(def.description).toBeTruthy();
    }
  });
});

describe('Public V1 error documentation links', () => {
  it('derives stable anchors and additive documentation URLs from error codes', () => {
    expect(v1ErrorCodeAnchor('RATE_LIMITED')).toBe('rate-limited');
    expect(v1ErrorDocumentationUrl('RESOURCE_NOT_FOUND'))
      .toBe('https://mdtbbs.cn/api/v1/docs/errors#resource-not-found');
    expect(apiV1Error('RATE_LIMITED', 'too many requests', true, [], 'req-1').error.documentation_url)
      .toBe('https://mdtbbs.cn/api/v1/docs/errors#rate-limited');
  });
});
