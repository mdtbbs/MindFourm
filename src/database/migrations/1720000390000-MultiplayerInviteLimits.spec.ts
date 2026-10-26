import { MultiplayerInviteLimits1720000390000 } from './1720000390000-MultiplayerInviteLimits';

function makeRunner() {
  const indices = new Set<string>();
  const statements: string[] = [];
  const query = jest.fn(async (sql: string, parameters: unknown[] = []) => {
    if (sql.includes('information_schema.tables')) {
      return parameters[0] === 'multiplayer_invites' ? [{ exists: 1 }] : [];
    }
    if (sql.includes('information_schema.statistics')) {
      return indices.has(`${parameters[0]}:${parameters[1]}`) ? [{ exists: 1 }] : [];
    }
    if (sql.includes('information_schema.columns')) return [{ exists: 1 }];
    statements.push(sql);
    const created = sql.match(/CREATE INDEX `([^`]+)` ON `([^`]+)`/);
    if (created) indices.add(`${created[2]}:${created[1]}`);
    const dropped = sql.match(/DROP INDEX `([^`]+)` ON `([^`]+)`/);
    if (dropped) indices.delete(`${dropped[2]}:${dropped[1]}`);
    return [];
  });
  return { runner: { query } as any, indices, statements };
}

describe('MultiplayerInviteLimits1720000390000', () => {
  it('indexes sender caps and session-target idempotency lookups', async () => {
    const { runner, indices, statements } = makeRunner();
    const migration = new MultiplayerInviteLimits1720000390000();

    await migration.up(runner);
    await migration.up(runner);

    expect(indices).toEqual(new Set([
      'multiplayer_invites:idx_multiplayer_invites_sender_status_expiry',
      'multiplayer_invites:idx_multiplayer_invites_session_target_status_expiry',
    ]));
    expect(statements.filter((sql) => sql.startsWith('CREATE INDEX'))).toHaveLength(2);
    expect(statements).toContain('CREATE INDEX `idx_multiplayer_invites_sender_status_expiry` ON `multiplayer_invites` (`sender_user_id`, `status`, `expires_at`)');
    expect(statements).toContain('CREATE INDEX `idx_multiplayer_invites_session_target_status_expiry` ON `multiplayer_invites` (`session_id`, `target_user_id`, `status`, `expires_at`)');

    await migration.down(runner);
    expect(indices.size).toBe(0);
  });
});
