import {
  MOD_FILTER_KINDS,
  collectPublicRequiredModOptions,
  dependencyTableAvailability,
  isModFilterKind,
  parseModFilterTokens,
  publicSelectedVersionIdSql,
  publicTargetVisibleSql,
  requiredDependencyProofSql,
  resolvePublicCanonicalModIds,
  unresolvedRequiredDependencySql,
} from './resource-mod-dependency-filter';

/**
 * Issue #70: the shared Mod dependency rule.
 *
 * These cases pin the rule itself — the selector, the visibility predicate, the
 * token resolver and the table-availability behaviour — so both readers (the
 * list query and `filter-options`) can only fail together, and so a rewrite of
 * the SQL cannot quietly stop mirroring the read paths it claims to mirror.
 * The list query's own wiring is pinned in `resources.service.spec.ts`.
 */
describe('resource Mod dependency filter rule', () => {
  it('gates the condition on the kinds that carry version-level dependency evidence', () => {
    expect(MOD_FILTER_KINDS).toEqual(['map', 'schematic']);
    expect(isModFilterKind('map')).toBe(true);
    expect(isModFilterKind('schematic')).toBe(true);
    for (const kind of ['mod', 'pack', 'save', 'other', '', undefined, null]) expect(isModFilterKind(kind)).toBe(false);
  });

  it('parses a comma-separated value like the tags filter: trimmed, de-duplicated, order kept', () => {
    expect(parseModFilterTokens(' alpha.mod , beta.mod ')).toEqual(['alpha.mod', 'beta.mod']);
    // One Mod is one condition, whichever spelling repeats: SQL is case-insensitive
    // and the resolver keys on lowercase, so both would select identical rows.
    expect(parseModFilterTokens('alpha.mod,ALPHA.MOD')).toEqual(['alpha.mod']);
    expect(parseModFilterTokens('alpha.mod,,  ,')).toEqual(['alpha.mod']);
    expect(parseModFilterTokens('')).toEqual([]);
    expect(parseModFilterTokens(undefined)).toEqual([]);
    expect(parseModFilterTokens('   ')).toEqual([]);
  });

  it('mirrors the D-A selected published version rule verbatim', () => {
    const sql = publicSelectedVersionIdSql('resource');
    expect(sql).toContain("sv.status = 'published'");
    expect(sql).toContain('sv.public_id IS NOT NULL');
    expect(sql).toContain('ORDER BY sv.recommended DESC, COALESCE(sv.published_at, sv.created_at) DESC, sv.revision DESC, sv.id DESC LIMIT 1');
    // The alternatives the contract forbids for this selector.
    expect(sql).not.toContain('latest_published_version_id');
    expect(sql).not.toContain('MAX(sv.id)');
  });

  it('mirrors the shared target visibility predicate', () => {
    const sql = publicTargetVisibleSql('target');
    expect(sql).toContain('target.is_public = 1');
    expect(sql).toContain('target.deleted_at IS NULL');
    expect(sql).toContain("target.status IN ('approved','published')");
    expect(sql).toContain("target.visibility IS NULL OR target.visibility <> 'private'");
    expect(sql).toContain('target.merged_into_resource_id IS NULL');
  });

  it('proves a required dependency through both tables and skips a mirrored legacy row', () => {
    const version = publicSelectedVersionIdSql('resource');
    const sql = requiredDependencyProofSql(version, 'resourceRequiredMod0', { modern: true, legacy: true })!;
    expect(sql).toContain('resource_dependencies d');
    expect(sql).toContain('resource_version_dependencies d');
    expect(sql).toContain('copied.legacy_source_id = d.id');
    expect(sql).toContain("d.dependency_type = 'required'");
    expect(sql).toContain('profile.mod_id = :resourceRequiredMod0');
    expect(sql).toContain(publicTargetVisibleSql('target'));
    // The proof is a join, not a string comparison against the raw identifier:
    // a hidden or merged target must never resolve through `external_identifier`.
    expect(sql).not.toContain('external_identifier');
    // One table only, no needless legacy guard.
    const modernOnly = requiredDependencyProofSql(version, 'x', { modern: true, legacy: false })!;
    expect(modernOnly).toContain('resource_dependencies d');
    expect(modernOnly).not.toContain('resource_version_dependencies');
    // Nothing readable proves nothing.
    expect(requiredDependencyProofSql(version, 'x', { modern: false, legacy: false })).toBeNull();
  });

  it('flags an unprovable required row as unresolved evidence', () => {
    const version = publicSelectedVersionIdSql('resource');
    const sql = unresolvedRequiredDependencySql(version, { modern: true, legacy: true })!;
    expect(sql).toContain('NOT EXISTS (SELECT 1 FROM resources target');
    expect(sql).toContain('profile.resource_id = target.id');
    expect(sql).toContain("d.dependency_type = 'required'");
    // A row resolved to a hidden, merged or profile-less target counts as
    // unresolved too: the projection fails closed on exactly those shapes.
    expect(sql).toContain('target.merged_into_resource_id IS NULL');
    expect(unresolvedRequiredDependencySql(version, { modern: false, legacy: false })).toBeNull();
  });

  it('resolves canonical IDs from tokens and aliases, and never from an invisible Mod', async () => {
    const query = jest.fn(async () => [
      { mod_id: 'alpha.mod', requested_identifier: 'alpha.mod' },
      { mod_id: 'beta.mod', requested_identifier: 'beta-alias' },
    ]);
    const dataSource = { query } as never;

    const resolved = await resolvePublicCanonicalModIds(dataSource, ['alpha.mod', 'BETA-ALIAS']);

    expect(resolved.get('alpha.mod')).toBe('alpha.mod');
    expect(resolved.get('beta-alias')).toBe('beta.mod');
    // The visibility predicate travels with the resolver: an alias for a hidden,
    // merged or deleted Mod is not a readable identity.
    expect(String(query.mock.calls[0][0])).toContain('resource.deleted_at IS NULL');
    expect(String(query.mock.calls[0][0])).toContain('resource.merged_into_resource_id IS NULL');
    expect(String(query.mock.calls[0][0])).toContain("resource.visibility IS NULL OR resource.visibility <> 'private'");
  });

  it('resolves nothing when the Mod catalog cannot be read', async () => {
    const dataSource = { query: jest.fn(async () => { throw new Error('no mod_profiles'); }) } as never;
    await expect(resolvePublicCanonicalModIds(dataSource, ['alpha.mod'])).resolves.toEqual(new Map());
    await expect(resolvePublicCanonicalModIds(dataSource, [])).resolves.toEqual(new Map());
  });

  it('reads table availability once per data source and fails closed on an unreadable schema', async () => {
    const query = jest.fn(async () => [{ table_name: 'resource_dependencies' }]);
    const dataSource = { query } as never;
    const first = await dependencyTableAvailability(dataSource);
    const second = await dependencyTableAvailability(dataSource);
    expect(first).toEqual({ modern: true, legacy: false });
    expect(second).toEqual(first);
    expect(query).toHaveBeenCalledTimes(1);

    const failing = { query: jest.fn(async () => { throw new Error('information_schema unavailable'); }) } as never;
    await expect(dependencyTableAvailability(failing)).resolves.toEqual({ modern: false, legacy: false });
  });

  it('collects filter options from the same selector and visibility predicate as the list', async () => {
    const query = jest.fn(async (sql: string) => (sql.includes('resource_version_dependencies d ON')
      ? [{ mod_id: 'legacy.mod' }]
      : [{ mod_id: 'alpha.mod' }]));
    const dataSource = { query } as never;

    const options = await collectPublicRequiredModOptions(dataSource, { modern: true, legacy: true });

    expect(options).toEqual(['alpha.mod', 'legacy.mod']);
    for (const sql of query.mock.calls.map(([value]) => String(value))) {
      expect(sql).toContain('resource_versions sv WHERE sv.resource_id = resource.id');
      expect(sql).toContain("sv.status = 'published'");
      expect(sql).toContain('sv.public_id IS NOT NULL');
      expect(sql).toContain("resource.resource_kind IN ('map','schematic')");
      expect(sql).toContain("d.dependency_type = 'required'");
      expect(sql).toContain('target.is_public = 1');
      expect(sql).toContain('target.merged_into_resource_id IS NULL');
      expect(sql).toContain("target.visibility IS NULL OR target.visibility <> 'private'");
      // Options are canonical Mod IDs: an unresolved row never becomes an option.
      expect(sql).not.toContain('external_identifier');
    }
  });

  it('keeps the other table\'s options when one table cannot be read', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('resource_dependencies d ON')) throw new Error('modern table unusable');
      return [{ mod_id: 'legacy.mod' }];
    });
    const dataSource = { query } as never;
    const options = await collectPublicRequiredModOptions(dataSource, { modern: true, legacy: true });
    expect(options).toEqual(['legacy.mod']);
  });
});
