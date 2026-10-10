import { decodeCursor, encodeCursor } from './cursor.util';

describe('encodeCursor', () => {
  it('joins values with a colon and base64url-encodes them', () => {
    expect(encodeCursor(42, 'abc')).toBe(Buffer.from('42:abc').toString('base64url'));
  });

  it('converts dates to epoch milliseconds', () => {
    const date = new Date('2026-01-02T03:04:05.006Z');
    expect(decodeCursor(encodeCursor(date))).toEqual([String(date.getTime())]);
  });

  it('produces a URL-safe cursor with no padding', () => {
    const cursor = encodeCursor(1, 'a/b+c');
    expect(cursor).not.toMatch(/[+/=]/);
  });
});

describe('decodeCursor', () => {
  it('round-trips the values it was given, as strings', () => {
    expect(decodeCursor(encodeCursor(7, 'slug', 0))).toEqual(['7', 'slug', '0']);
  });

  it('keeps empty segments so positional reads stay stable', () => {
    expect(decodeCursor(encodeCursor('', 'x'))).toEqual(['', 'x']);
  });

  it('returns a single segment when the cursor holds one value', () => {
    expect(decodeCursor(encodeCursor(9))).toEqual(['9']);
  });
});
