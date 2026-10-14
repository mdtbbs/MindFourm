import {
  EXTERNAL_API_SCOPES,
  hasAnyExternalScope,
  hasExternalScope,
  hasStrictExternalScope,
  isWildcardExternalScope,
} from './external-api-scopes';

describe('external scope matcher', () => {
  it('keeps the general matcher permissive for ordinary integrations', () => {
    expect(hasExternalScope(['*'], 'posts:read')).toBe(true);
    expect(hasExternalScope(['admin:*'], 'posts:read')).toBe(true);
    expect(hasExternalScope(['posts:*'], 'posts:read')).toBe(true);
    expect(hasExternalScope(['posts:read'], 'posts:read')).toBe(true);
    expect(hasExternalScope(['posts:write'], 'posts:read')).toBe(false);
    expect(hasAnyExternalScope(['friends:read'], ['lanlink:auth', 'friends:read'])).toBe(true);
  });

  it('classifies every wildcard form the deny override must catch', () => {
    for (const scope of ['*', 'admin:*', 'posts:*', 'lanlink:*']) {
      expect(isWildcardExternalScope(scope)).toBe(true);
    }
    for (const scope of ['lanlink:auth', 'posts:read']) {
      expect(isWildcardExternalScope(scope)).toBe(false);
    }
  });

  it('requires an exact scope and refuses any wildcard grant', () => {
    expect(hasStrictExternalScope(['lanlink:auth'], ['lanlink:auth'])).toBe(true);
    expect(hasStrictExternalScope(['backupsave:auth'], ['lanlink:auth', 'backupsave:auth'])).toBe(true);

    // Wildcard grants that the general matcher accepts must not stand in for
    // the dedicated, reviewed key.
    expect(hasStrictExternalScope(['*'], ['lanlink:auth'])).toBe(false);
    expect(hasStrictExternalScope(['admin:*'], ['lanlink:auth'])).toBe(false);
    expect(hasStrictExternalScope(['lanlink:*'], ['lanlink:auth'])).toBe(false);
    expect(hasStrictExternalScope(['*', 'lanlink:auth'], ['lanlink:auth'])).toBe(false);
    expect(hasStrictExternalScope(['admin:*', 'lanlink:auth'], ['lanlink:auth'])).toBe(false);

    // No required scope and an unrelated scope both mean "not granted".
    expect(hasStrictExternalScope(['lanlink:auth'], [])).toBe(false);
    expect(hasStrictExternalScope(['friends:read'], ['lanlink:auth'])).toBe(false);
  });

  it('registers the legacy quick-code scope as its own narrow grant', () => {
    expect(EXTERNAL_API_SCOPES).toContain('lanlink:legacy_quick_code');
    // The dedicated OAuth scope must not implicitly unlock the legacy surface.
    expect(hasStrictExternalScope(['lanlink:auth'], ['lanlink:legacy_quick_code'])).toBe(false);
  });
});
