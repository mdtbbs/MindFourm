/**
 * Whether a database error is a unique-constraint collision.
 *
 * "Does this row already exist?" followed by an insert is a read-then-write race, so
 * any endpoint that has to be idempotent still meets the constraint under a
 * concurrent double submit. Distinguishing that collision from a real failure is what
 * lets the loser return the winner's row instead of a 500.
 *
 * Typed through `unknown` and matched on the driver code rather than an `instanceof
 * QueryFailedError` check, so callers can be unit-tested without loading the driver.
 */
export function isDuplicateKeyError(error: unknown): boolean {
  const candidate = error as { code?: string; driverError?: { code?: string } } | null;
  return candidate?.code === 'ER_DUP_ENTRY' || candidate?.driverError?.code === 'ER_DUP_ENTRY';
}
