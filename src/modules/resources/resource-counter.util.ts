import type { EntityManager } from 'typeorm';

/**
 * Increment a Resource aggregate counter without touching `updated_at`.
 *
 * `manager.increment(Resource, ...)` is not usable here: TypeORM's
 * UpdateQueryBuilder appends `updated_at = CURRENT_TIMESTAMP` to every update
 * that does not name that column, so one page view or one download would move a
 * resource's advertised date. Counting is traffic, not authorship, so this
 * writes only the counter column.
 *
 * Returns the number of affected rows so callers keep their existing
 * "resource disappeared mid-transaction" signal.
 */
export async function incrementResourceCounter(
  manager: EntityManager,
  resourceId: number,
  column: 'view_count' | 'download_count',
  delta = 1,
): Promise<number> {
  const result = await manager.query(
    `UPDATE \`resources\` SET \`${column}\` = \`${column}\` + ? WHERE \`id\` = ?`,
    [delta, resourceId],
  );
  return Number(result?.affectedRows ?? result?.[0]?.affectedRows ?? 0);
}
