import { lookupV1ErrorCode, getAllV1ErrorCodes, V1_ERROR_CODES } from './v1-error-codes';

describe('V1 Error Code Registry', () => {
  it('looks up a known error code', () => {
    const def = lookupV1ErrorCode('RESOURCE_NOT_FOUND');
    expect(def).not.toBeNull();
    expect(def!.httpStatus).toBe(404);
    expect(def!.retryable).toBe(false);
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
