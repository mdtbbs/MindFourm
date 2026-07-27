import { BadRequestException } from '@nestjs/common';
import { parseDateCursor, toDateCursor } from './date-cursor.util';

describe('date cursors', () => {
  it('parses a round-tripped ISO cursor back into a Date', () => {
    // The value the client actually returns: a Date that went out through JSON.
    const original = new Date('2026-07-26T19:07:14.726Z');
    const parsed = parseDateCursor(toDateCursor(original)!);

    expect(parsed).toBeInstanceOf(Date);
    expect(parsed.getTime()).toBe(original.getTime());
  });

  it('rejects a malformed cursor instead of silently matching nothing', () => {
    // Passing the raw string to MySQL matched zero rows without erroring, which read
    // as "no more pages" rather than "bad input".
    expect(() => parseDateCursor('not-a-date')).toThrow(BadRequestException);
    expect(() => parseDateCursor('')).toThrow(BadRequestException);
  });

  it('accepts the string form a raw MAX(created_at) aggregate can return', () => {
    expect(toDateCursor('2026-07-27 03:07:14.726')).toBe(
      new Date('2026-07-27 03:07:14.726').toISOString(),
    );
  });

  it('returns null for an absent or unparseable timestamp', () => {
    expect(toDateCursor(null)).toBeNull();
    expect(toDateCursor(undefined)).toBeNull();
    expect(toDateCursor('nonsense')).toBeNull();
  });
});
