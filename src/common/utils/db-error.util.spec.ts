import { isDuplicateKeyError } from './db-error.util';

describe('isDuplicateKeyError', () => {
  it('recognizes a MySQL unique-constraint collision', () => {
    expect(isDuplicateKeyError({ code: 'ER_DUP_ENTRY' })).toBe(true);
  });

  it('recognizes the collision when the driver nests the code', () => {
    // QueryFailedError carries the driver error; the code lives one level down.
    expect(isDuplicateKeyError({ driverError: { code: 'ER_DUP_ENTRY' } })).toBe(true);
  });

  it('does not treat other database errors as collisions', () => {
    expect(isDuplicateKeyError({ code: 'ER_NO_REFERENCED_ROW_2' })).toBe(false);
    expect(isDuplicateKeyError({ code: 'ECONNREFUSED', driverError: { code: 'ETIMEDOUT' } })).toBe(false);
  });

  it('survives null, undefined and non-object errors', () => {
    expect(isDuplicateKeyError(null)).toBe(false);
    expect(isDuplicateKeyError(undefined)).toBe(false);
    expect(isDuplicateKeyError('ER_DUP_ENTRY')).toBe(false);
    expect(isDuplicateKeyError(new Error('ER_DUP_ENTRY'))).toBe(false);
  });

  it('does not match a code that merely starts with the collision code', () => {
    expect(isDuplicateKeyError({ code: 'ER_DUP_ENTRY_SOMETHING' })).toBe(false);
  });
});
