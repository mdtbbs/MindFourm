/**
 * Opaque pagination cursor for blob listings.
 *
 * The listing is ordered by `(created_at DESC, id DESC)`, so the cursor only has
 * to remember those two values. It is base64url-encoded JSON rather than a
 * readable pair because clients must treat it as opaque — decoding it and
 * inventing a position would let a hand-built cursor skip the tie-breaker.
 */
export type BlobCursor = { created_at: string; id: string };

export function encodeBlobCursor(created_at: Date | string, id: string): string {
  const value = created_at instanceof Date ? created_at.toISOString() : String(created_at);
  return Buffer.from(JSON.stringify({ t: value, i: id }), 'utf8').toString('base64url');
}

export function decodeBlobCursor(cursor: string | undefined | null): BlobCursor | null {
  if (!cursor || typeof cursor !== 'string' || cursor.length > 300) return null;
  let parsed: any;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  const createdAt = typeof parsed?.t === 'string' ? new Date(parsed.t) : null;
  if (!createdAt || Number.isNaN(createdAt.getTime())) return null;
  if (typeof parsed?.i !== 'string' || !parsed.i || parsed.i.length > 64) return null;
  return { created_at: createdAt.toISOString(), id: parsed.i };
}
