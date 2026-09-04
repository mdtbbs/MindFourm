/**
 * Cursor pagination utilities
 */

/**
 * Encode cursor from values
 */
export function encodeCursor(...values: (string | number | Date)[]): string {
  const raw = values.map((v) => (v instanceof Date ? v.getTime() : String(v))).join(':');
  return Buffer.from(raw).toString('base64url');
}

/**
 * Decode cursor to values
 */
export function decodeCursor(cursor: string): string[] {
  const raw = Buffer.from(cursor, 'base64url').toString('utf-8');
  return raw.split(':');
}
