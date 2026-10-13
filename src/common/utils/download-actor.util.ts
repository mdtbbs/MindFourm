/**
 * Pseudonymous actor identity for the download ledger, shared by every entry
 * point that records a grant or a completion.
 *
 * Both dedup keys are built from this string — grant rows compare
 * `(file, actorKey)` in `download_grant_dedup`, and completion rows compare
 * `(file, actorKey, minute)` through `uq_download_events_dedup_bucket`. Two
 * routes must therefore derive the *same* string for the same visitor,
 * otherwise one visitor downloading one file through two routes is counted
 * twice.
 *
 * Authenticated users identify by their account. Anonymous visitors identify
 * as `ipua:<client ip>:<user-agent>`, with the agent cut to the 80 characters
 * the event column stores. Callers only persist a hash of this value (the
 * grant service and `recordCompletion` hash it again); raw IP and user agent
 * never reach the database.
 */
export function downloadActorKey(
  userId: number | string | null | undefined,
  clientIp: string | null | undefined,
  userAgent: string | null | undefined,
): string {
  const id = Number(userId);
  if (Number.isSafeInteger(id) && id > 0) return `user:${id}`;
  return `ipua:${String(clientIp || '').trim() || 'unknown'}:${String(userAgent || '').slice(0, 80)}`;
}
