/**
 * Cursor-based pagination helpers for SQLite.
 * Cursor format: base64(timestamp,id)
 */

function encodeCursor(...values) {
  return Buffer.from(values.join(',')).toString('base64');
}

function decodeCursor(cursor) {
  return Buffer.from(cursor, 'base64').toString('utf8').split(',');
}

module.exports = { encodeCursor, decodeCursor };
