import { TimelapseBattleReports1720000440000 } from './1720000440000-TimelapseBattleReports';

function makeRunner(existing: Set<string> = new Set()) {
  const statements: string[] = [];
  const query = jest.fn(async (sql: string, parameters: unknown[] = []) => {
    if (sql.includes('information_schema.tables')) {
      return parameters[0] && existing.has(String(parameters[0])) ? [{ exists: 1 }] : [];
    }
    statements.push(sql);
    return [];
  });
  return { runner: { query } as any, statements };
}

describe('TimelapseBattleReports1720000440000', () => {
  it('creates both tables with the lifecycle indexes and reference foreign key', async () => {
    const { runner, statements } = makeRunner();
    await new TimelapseBattleReports1720000440000().up(runner);

    const sql = statements.join('\n');
    expect(sql).toContain('CREATE TABLE timelapse_reports');
    expect(sql).toContain('CREATE TABLE timelapse_post_refs');
    expect(sql).toContain('status ENUM(\'uploading\',\'queued\',\'processing\',\'pending_review\',\'published\',\'rejected\',\'failed\')');
    expect(sql).toContain('INDEX idx_tr_author_unbound (author_user_id, bound_post_count, deleted_at)');
    expect(sql).toContain('INDEX idx_tr_expiry (expires_at, bound_post_count, deleted_at)');
    expect(sql).toContain('INDEX idx_tr_source_purge (source_purge_after)');
    expect(sql).toContain('CONSTRAINT fk_tpr_timelapse FOREIGN KEY (timelapse_id) REFERENCES timelapse_reports(id) ON DELETE CASCADE');
  });

  it('is idempotent when both tables already exist', async () => {
    const existing = new Set(['timelapse_reports', 'timelapse_post_refs']);
    const { runner, statements } = makeRunner(existing);
    await new TimelapseBattleReports1720000440000().up(runner);
    expect(statements).toEqual([]);
  });

  it('drops the reference table before the report table', async () => {
    const { runner, statements } = makeRunner();
    await new TimelapseBattleReports1720000440000().down(runner);
    expect(statements).toEqual([
      'DROP TABLE IF EXISTS timelapse_post_refs',
      'DROP TABLE IF EXISTS timelapse_reports',
    ]);
  });
});
