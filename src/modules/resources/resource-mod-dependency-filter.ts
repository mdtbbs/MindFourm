import { DataSource } from 'typeorm';
import { PUBLIC_RESOURCE_STATUSES } from '../../common/utils/constants';

/**
 * Shared read-side rule for the Map/Schematic Mod dependency filter (Issue #70).
 *
 * One module owns both halves of the rule so the list query and `filter-options`
 * cannot drift apart:
 *   - `publicSelectedVersionIdSql` mirrors `ResourcesV2Service.selectedVersion()`
 *     verbatim (published + `public_id IS NOT NULL`, ordered by `recommended`
 *     then `COALESCE(published_at, created_at)` then `revision` then `id`). That
 *     ordered subquery is the only selector; `latest_published_version_id`,
 *     `created_at` and `MAX(id)` are not alternatives.
 *   - `publicTargetVisibleSql` mirrors the target visibility predicate of
 *     `ResourceDependencyReadService` (`is_public`, `deleted_at`, public status,
 *     explicit `private` visibility, and `merged_into_resource_id`), which is
 *     also the predicate the public `resolveMod` endpoint reads through.
 *
 * Query tokens are resolved with `resolvePublicCanonicalModIds` — canonical
 * `mod_id` first, then `mod_id_aliases`, both only for publicly visible Mods —
 * before any filter SQL is built. That is the same read-side resolution
 * `ResourcesV2Service.resolveMod` performs, so an alias and its canonical
 * spelling select the same rows, and a token that resolves to nothing can only
 * produce an empty result instead of a silently widened one.
 *
 * Only `dependency_type = 'required'` rows count. That is not a simplification:
 * the Map/Schematic analysis persistence writes every dependency row as
 * `required` (`resource-version-analysis.persistence.ts`), while
 * `optional`/`incompatible`/`embedded` are Mod-manifest concepts that never
 * reach a map or blueprint version. Both predicates stay symmetric — "proven
 * required dependency on X" versus "unprovable required dependency" — which is
 * the fail-closed pair the shared projection defines.
 */

/** Only these kinds carry version-level Mod dependency evidence. */
export const MOD_FILTER_KINDS: readonly string[] = ['map', 'schematic'];

/** The kinds whose selected published version can answer a Mod dependency filter. */
export function isModFilterKind(kind?: string | null): boolean {
  return Boolean(kind) && MOD_FILTER_KINDS.includes(String(kind));
}

/**
 * Split a comma-separated filter value the way the `tags` filter does: trim,
 * drop empty entries, de-duplicate case-insensitively (one Mod, one condition)
 * while keeping the spelling the caller used first.
 */
export function parseModFilterTokens(value?: string | null): string[] {
  const tokens: string[] = [];
  const seen = new Set<string>();
  for (const item of String(value ?? '').split(',')) {
    const token = item.trim();
    const key = token.toLowerCase();
    if (!token || seen.has(key)) continue;
    seen.add(key);
    tokens.push(token);
  }
  return tokens;
}

/** The public statuses, rendered once so this file cannot drift from the constant. */
const PUBLIC_STATUS_LIST = PUBLIC_RESOURCE_STATUSES.map((status) => `'${status}'`).join(',');

/**
 * The selected published version of one resource, as an id expression over
 * `resource_versions`. `resourceAlias` is the resources-table alias in scope.
 */
export function publicSelectedVersionIdSql(resourceAlias: string): string {
  return `(SELECT sv.id FROM resource_versions sv WHERE sv.resource_id = ${resourceAlias}.id AND sv.public_id IS NOT NULL AND sv.status = 'published' ORDER BY sv.recommended DESC, COALESCE(sv.published_at, sv.created_at) DESC, sv.revision DESC, sv.id DESC LIMIT 1)`;
}

/**
 * Public visibility of a resource, written once and reused by every fragment
 * below. `private` is excluded explicitly because a resource can carry
 * `visibility = 'private'` while `is_public` is still 1.
 */
export function publicTargetVisibleSql(alias: string): string {
  return `${alias}.is_public = 1 AND ${alias}.deleted_at IS NULL AND ${alias}.status IN (${PUBLIC_STATUS_LIST}) AND (${alias}.visibility IS NULL OR ${alias}.visibility <> 'private') AND ${alias}.merged_into_resource_id IS NULL`;
}

export type DependencyTableAvailability = { modern: boolean; legacy: boolean };

/**
 * Which dependency tables exist right now. The V2 migration and the legacy
 * evidence table are independent surfaces — the readers guard on both —
 * so the filter does too instead of assuming a fully migrated database.
 * Cached per DataSource: availability cannot change within one process.
 */
const availabilityCache = new WeakMap<DataSource, Promise<DependencyTableAvailability>>();
export function dependencyTableAvailability(dataSource: DataSource): Promise<DependencyTableAvailability> {
  let pending = availabilityCache.get(dataSource);
  if (!pending) {
    pending = dataSource.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('resource_dependencies','resource_version_dependencies')`,
    ).then((rows: Array<{ table_name?: unknown }>) => {
      const present = new Set(rows.map((row) => String(row?.table_name ?? '')));
      return { modern: present.has('resource_dependencies'), legacy: present.has('resource_version_dependencies') };
    }).catch(() => ({ modern: false, legacy: false }));
    availabilityCache.set(dataSource, pending);
  }
  return pending;
}

/**
 * One dependency-table branch of a proof. A legacy row that the V2 migration
 * already mirrored is skipped exactly like `ResourceDependencyReadService`
 * does, so mixed datasets do not read one relationship twice.
 */
function dependencyBranch(
  table: string,
  body: string,
  tables: DependencyTableAvailability,
): string {
  const legacyCopyGuard = table === 'resource_version_dependencies' && tables.modern
    ? ` AND NOT EXISTS (SELECT 1 FROM resource_dependencies copied WHERE copied.legacy_source_id = d.id)`
    : '';
  return `EXISTS (SELECT 1 FROM ${table} d ${body}${legacyCopyGuard})`;
}

/**
 * `TRUE` when the version carries a `required` dependency that resolves to the
 * publicly visible canonical Mod named by `parameter`.
 *
 * A row is *proven* only when its `target_resource_id` points at a publicly
 * visible Mod resource that owns a `mod_profiles` row — exactly the shape
 * `ResourcesV2Service.loadModDependencies` turns into a canonical `mod_id`. A
 * row whose target is missing, hidden, merged or profile-less is never resolved
 * through its `external_identifier`: the shared projection fails closed on it
 * ("resolving that string to a node would expose the hidden target's identity"),
 * and so does this predicate. `null` means no dependency table exists, i.e. no
 * version can prove a dependency.
 */
export function requiredDependencyProofSql(
  versionIdSql: string,
  parameter: string,
  tables: DependencyTableAvailability,
): string | null {
  const branches: string[] = [];
  const proof = `WHERE d.resource_version_id = ${versionIdSql} AND d.dependency_type = 'required' AND EXISTS (SELECT 1 FROM resources target JOIN mod_profiles profile ON profile.resource_id = target.id WHERE target.id = d.target_resource_id AND profile.mod_id = :${parameter} AND ${publicTargetVisibleSql('target')})`;
  if (tables.modern) branches.push(dependencyBranch('resource_dependencies', proof, tables));
  if (tables.legacy) branches.push(dependencyBranch('resource_version_dependencies', proof, tables));
  return branches.length ? `(${branches.join(' OR ')})` : null;
}

/**
 * `TRUE` when the version still carries a `required` dependency row that cannot
 * be proven against a publicly visible canonical Mod. Every such row is the
 * projection's fail-closed case (missing target, hidden/merged target, or a
 * visible target without a profile), so the version cannot be proven to omit a
 * Mod and must not answer an `excluded_mods` condition. `null` means no
 * dependency table exists, i.e. nothing is unproven.
 */
export function unresolvedRequiredDependencySql(
  versionIdSql: string,
  tables: DependencyTableAvailability,
): string | null {
  const branches: string[] = [];
  const unresolved = `WHERE d.resource_version_id = ${versionIdSql} AND d.dependency_type = 'required' AND NOT EXISTS (SELECT 1 FROM resources target JOIN mod_profiles profile ON profile.resource_id = target.id WHERE target.id = d.target_resource_id AND ${publicTargetVisibleSql('target')})`;
  if (tables.modern) branches.push(dependencyBranch('resource_dependencies', unresolved, tables));
  if (tables.legacy) branches.push(dependencyBranch('resource_version_dependencies', unresolved, tables));
  return branches.length ? `(${branches.join(' OR ')})` : null;
}

/**
 * Read-side token resolver, mirroring `ResourcesV2Service.resolveMod`: canonical
 * `mod_id` first, then `mod_id_aliases`, and only for Mods that are public,
 * undeleted and unmerged. Returns `lowercased token -> canonical mod_id`; a
 * token with no entry cannot be resolved and must make the whole query empty.
 * A missing `mod_profiles` table resolves nothing rather than failing the page.
 */
export async function resolvePublicCanonicalModIds(
  dataSource: DataSource,
  tokens: string[],
): Promise<Map<string, string>> {
  const resolved = new Map<string, string>();
  if (!tokens.length) return resolved;
  const placeholders = tokens.map(() => '?').join(',');
  let rows: Array<{ mod_id?: unknown; requested_identifier?: unknown }>;
  try {
    rows = await dataSource.query(
      `SELECT profile.mod_id AS mod_id, COALESCE(alias.alias, profile.mod_id) AS requested_identifier
       FROM mod_profiles profile
       JOIN resources resource ON resource.id = profile.resource_id
       LEFT JOIN mod_id_aliases alias ON alias.resource_id = profile.resource_id AND alias.alias IN (${placeholders})
       WHERE (profile.mod_id IN (${placeholders}) OR alias.alias IS NOT NULL)
         AND ${publicTargetVisibleSql('resource')}`,
      [...tokens, ...tokens],
    );
  } catch {
    // No Mod catalog yet (or an unmigrated database): nothing resolves.
    return resolved;
  }
  const requested = new Set(tokens.map((token) => token.toLowerCase()));
  // A direct canonical match wins over an alias, so a spelling that is both
  // keeps the identity the public resolve endpoint reports.
  for (const row of rows) {
    const modId = String(row?.mod_id ?? '');
    if (modId && requested.has(modId.toLowerCase())) resolved.set(modId.toLowerCase(), modId);
  }
  for (const row of rows) {
    const modId = String(row?.mod_id ?? '');
    const identifier = String(row?.requested_identifier ?? '').toLowerCase();
    if (modId && identifier && requested.has(identifier) && !resolved.has(identifier)) resolved.set(identifier, modId);
  }
  return resolved;
}

/**
 * Canonical Mod options for the list filter: every publicly visible Mod that a
 * public selected published Map/Schematic version is proven to require.
 * Unresolved tokens never become options, so the UI cannot offer a Mod that no
 * resource can match. Runs one query per existing table because the two tables
 * are independent surfaces; `DISTINCT` collapses a mirrored legacy row into its
 * modern twin.
 */
export async function collectPublicRequiredModOptions(
  dataSource: DataSource,
  tables: DependencyTableAvailability,
): Promise<string[]> {
  const options = new Set<string>();
  const run = async (table: string) => {
    const rows: Array<{ mod_id?: unknown }> = await dataSource.query(
      `SELECT DISTINCT profile.mod_id AS mod_id
       FROM resources resource
       LEFT JOIN resource_categories category ON category.id = resource.category_id
       JOIN resource_versions sv ON sv.id = ${publicSelectedVersionIdSql('resource')}
       JOIN ${table} d ON d.resource_version_id = sv.id AND d.dependency_type = 'required'
       JOIN resources target ON target.id = d.target_resource_id
       JOIN mod_profiles profile ON profile.resource_id = d.target_resource_id
       WHERE resource.resource_kind IN (${MOD_FILTER_KINDS.map((kind) => `'${kind}'`).join(',')})
         AND resource.deleted_at IS NULL AND resource.status IN (${PUBLIC_STATUS_LIST}) AND resource.is_public = 1
         AND (category.id IS NULL OR category.is_active = 1)
         AND ${publicTargetVisibleSql('target')}`,
    );
    for (const row of rows) {
      const modId = String(row?.mod_id ?? '');
      if (modId) options.add(modId);
    }
  };
  // Independent try/catch per table: one table missing mid-migration must not
  // hide the other's options, matching the existing filter-options queries.
  if (tables.modern) { try { await run('resource_dependencies'); } catch { /* modern table unusable; legacy still runs */ } }
  if (tables.legacy) { try { await run('resource_version_dependencies'); } catch { /* legacy table unusable */ } }
  return Array.from(options).sort((a, b) => a.localeCompare(b, 'zh-CN'));
}
