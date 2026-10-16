import { MultiplayerVisibilityJoinPolicySplit1720000380000 } from './1720000380000-MultiplayerVisibilityJoinPolicySplit';

type Row = { visibility: string; join_policy: string; require_approval?: number };

/**
 * A stateful fake: the DDL and enum widths the migration changes are visible to
 * its later information_schema probes, and the UPDATEs actually transform rows, so
 * the tests can assert the real remap table instead of just "some SQL ran".
 */
function buildQueryRunner(rows: Row[], { columnPresent = false, indexPresent = false, enumShape = 'legacy' } = {}) {
  const state = {
    column: columnPresent,
    index: indexPresent,
    // Legacy widths: visibility has `unlisted` and join_policy has `request`.
    visibilityEnum: enumShape === 'legacy' ? "enum('private','friends','unlisted')" : "enum('private','friends','public')",
    joinPolicyEnum: enumShape === 'legacy' ? "enum('open','friends','request','invite_only')" : "enum('invite_only','friends','public')",
  };
  const query = jest.fn(async (sql: string, params?: any[]) => {
    const statement = String(sql);
    if (statement.includes('information_schema.tables')) return [{ 1: 1 }];
    if (statement.includes('information_schema.columns')) {
      const column = params?.[1];
      if (column === 'require_approval') return state.column ? [{ COLUMN_TYPE: 'tinyint(1)' }] : [];
      if (column === 'visibility') return [{ COLUMN_TYPE: state.visibilityEnum }];
      if (column === 'join_policy') return [{ COLUMN_TYPE: state.joinPolicyEnum }];
      // Pre-existing columns the discovery index spans.
      return [{ COLUMN_TYPE: 'datetime' }];
    }
    if (statement.includes('information_schema.statistics')) return state.index ? [{ 1: 1 }] : [];
    if (statement.includes('ADD COLUMN `require_approval`')) {
      state.column = true;
      // NOT NULL DEFAULT 0: existing rows get the default, not NULL.
      for (const row of rows) row.require_approval ??= 0;
      return [{ affectedRows: 0 }];
    }
    if (statement.includes('CREATE INDEX `idx_multiplayer_sessions_discovery`')) { state.index = true; return [{ affectedRows: 0 }]; }
    if (statement.includes('MODIFY COLUMN `visibility`')) {
      state.visibilityEnum = "enum('private','friends','public')";
      return [{ affectedRows: 0 }];
    }
    if (statement.includes('MODIFY COLUMN `join_policy`')) {
      state.joinPolicyEnum = "enum('invite_only','friends','public')";
      return [{ affectedRows: 0 }];
    }
    if (statement.startsWith('UPDATE `multiplayer_sessions` SET require_approval')) {
      for (const row of rows) if (row.join_policy === 'request') row.require_approval = 1;
      return [{ affectedRows: 0 }];
    }
    if (statement.includes('SET join_policy = ?')) {
      const [next, guard] = params!;
      if (guard !== next) return [{ affectedRows: 0 }];
      for (const row of rows) if (matchesWhere(statement, row)) row.join_policy = next;
      return [{ affectedRows: 0 }];
    }
    if (statement.includes("SET visibility = 'private' WHERE visibility = 'unlisted'")) {
      for (const row of rows) if (row.visibility === 'unlisted') row.visibility = 'private';
      return [{ affectedRows: 0 }];
    }
    return [{ affectedRows: 0 }];
  });
  return { state, query, rows };
}

function matchesWhere(statement: string, row: Row): boolean {
  const where = statement.slice(statement.indexOf('WHERE') + 5, statement.indexOf(' AND join_policy <>'));
  const conditions = where.split(' AND ');
  return conditions.every((condition) => {
    const inMatch = condition.match(/(visibility|join_policy)\s+IN\s+\(([^)]+)\)/);
    if (inMatch) {
      const values = inMatch[2].split(',').map((value) => value.trim().replace(/'/g, ''));
      return values.includes(row[inMatch[1] as 'visibility' | 'join_policy']);
    }
    const eqMatch = condition.match(/(visibility|join_policy)\s*=\s*'([^']+)'/);
    if (eqMatch) return row[eqMatch[1] as 'visibility' | 'join_policy'] === eqMatch[2];
    return true;
  });
}

describe('MultiplayerVisibilityJoinPolicySplit1720000380000', () => {
  it('remaps every legacy combination by effective eligibility', async () => {
    const queryRunner = buildQueryRunner([
      { visibility: 'private', join_policy: 'open' },
      { visibility: 'private', join_policy: 'friends' },
      { visibility: 'private', join_policy: 'invite_only' },
      { visibility: 'private', join_policy: 'request' },
      { visibility: 'friends', join_policy: 'open' },
      { visibility: 'friends', join_policy: 'friends' },
      { visibility: 'friends', join_policy: 'request' },
      { visibility: 'friends', join_policy: 'invite_only' },
      { visibility: 'unlisted', join_policy: 'open' },
      { visibility: 'unlisted', join_policy: 'friends' },
      { visibility: 'unlisted', join_policy: 'invite_only' },
      { visibility: 'unlisted', join_policy: 'request' },
    ]);

    await new MultiplayerVisibilityJoinPolicySplit1720000380000().up(queryRunner as any);

    expect(queryRunner.rows).toEqual([
      // `private` used to deny every un-invited join, so non-invite rows collapse
      // onto invite_only; only an approved request survives as a public policy.
      { visibility: 'private', join_policy: 'invite_only', require_approval: 0 },
      { visibility: 'private', join_policy: 'invite_only', require_approval: 0 },
      { visibility: 'private', join_policy: 'invite_only', require_approval: 0 },
      { visibility: 'private', join_policy: 'public', require_approval: 1 },
      // `friends` already gated on friendship, which the new policy preserves.
      { visibility: 'friends', join_policy: 'friends', require_approval: 0 },
      { visibility: 'friends', join_policy: 'friends', require_approval: 0 },
      { visibility: 'friends', join_policy: 'friends', require_approval: 1 },
      { visibility: 'friends', join_policy: 'invite_only', require_approval: 0 },
      // `unlisted` collapses into `private` and *inherits its old join_policy* —
      // the code-only room becomes private + public, the friends room stays a
      // friends room rather than being widened or narrowed.
      { visibility: 'private', join_policy: 'public', require_approval: 0 },
      { visibility: 'private', join_policy: 'friends', require_approval: 0 },
      { visibility: 'private', join_policy: 'invite_only', require_approval: 0 },
      { visibility: 'private', join_policy: 'public', require_approval: 1 },
    ]);
  });

  it('adds the approval column, shrinks both enums, and indexes discovery', async () => {
    const queryRunner = buildQueryRunner([{ visibility: 'private', join_policy: 'friends' }]);
    await new MultiplayerVisibilityJoinPolicySplit1720000380000().up(queryRunner as any);

    const ddl = queryRunner.query.mock.calls.map(([sql]) => String(sql));
    expect(ddl.some((sql) => sql.includes('ADD COLUMN `require_approval` TINYINT(1) NOT NULL DEFAULT 0'))).toBe(true);
    expect(ddl.some((sql) => sql.includes("MODIFY COLUMN `visibility` ENUM('private','friends','public')"))).toBe(true);
    expect(ddl.some((sql) => sql.includes("MODIFY COLUMN `join_policy` ENUM('invite_only','friends','public')"))).toBe(true);
    expect(ddl.some((sql) => sql.includes('CREATE INDEX `idx_multiplayer_sessions_discovery`'))).toBe(true);
    expect(queryRunner.state.column).toBe(true);
    expect(queryRunner.state.index).toBe(true);
  });

  it('is idempotent when the new schema is already in place', async () => {
    const queryRunner = buildQueryRunner([{ visibility: 'private', join_policy: 'public', require_approval: 1 }],
      { columnPresent: true, indexPresent: true, enumShape: 'new' });
    await new MultiplayerVisibilityJoinPolicySplit1720000380000().up(queryRunner as any);

    const ddl = queryRunner.query.mock.calls.map(([sql]) => String(sql));
    expect(ddl.some((sql) => sql.includes('ADD COLUMN'))).toBe(false);
    expect(ddl.some((sql) => sql.includes('MODIFY COLUMN'))).toBe(false);
    expect(ddl.some((sql) => sql.includes('CREATE INDEX'))).toBe(false);
    // The remap probes still run, so a partially migrated table converges.
    expect(ddl.some((sql) => sql.includes('SET join_policy = ?'))).toBe(true);
  });

  it('restores the legacy vocabulary on rollback', async () => {
    const queryRunner = buildQueryRunner([{ visibility: 'private', join_policy: 'public', require_approval: 1 }],
      { columnPresent: true, indexPresent: true, enumShape: 'new' });
    await new MultiplayerVisibilityJoinPolicySplit1720000380000().down(queryRunner as any);

    const ddl = queryRunner.query.mock.calls.map(([sql]) => String(sql));
    expect(ddl.some((sql) => sql.includes("ENUM('private','friends','unlisted')"))).toBe(true);
    expect(ddl.some((sql) => sql.includes("ENUM('open','friends','request','invite_only')"))).toBe(true);
    expect(ddl.some((sql) => sql.includes('DROP COLUMN `require_approval`'))).toBe(true);
    expect(ddl.some((sql) => sql.includes('DROP INDEX `idx_multiplayer_sessions_discovery`'))).toBe(true);
  });

  it('skips the whole migration when the table does not exist yet', async () => {
    const queryRunner = {
      query: jest.fn(async (sql: string) => (String(sql).includes('information_schema.tables') ? [] : [])),
    };
    await new MultiplayerVisibilityJoinPolicySplit1720000380000().up(queryRunner as any);
    expect(queryRunner.query.mock.calls.every(([sql]) => String(sql).includes('information_schema.tables'))).toBe(true);
  });
});
