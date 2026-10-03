import { SecurityAccessLogs1720000240000 } from './1720000240000-SecurityAccessLogs';

describe('SecurityAccessLogs1720000240000', () => {
  it('creates indexed security access records compatible with MySQL 5.7', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await new SecurityAccessLogs1720000240000().up({ query } as any);
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS security_access_logs');
    expect(sql).toContain('ip_address VARCHAR(45)');
    expect(sql).toContain('idx_security_access_logs_ip_created');
    expect(sql).toContain('DATETIME(6)');
    expect(sql).not.toContain('FOREIGN KEY');
  });

  it('refuses rollback rather than dropping retained access evidence', async () => {
    const query = jest.fn();
    await expect(new SecurityAccessLogs1720000240000().down({ query } as any)).rejects.toThrow(/Refusing to drop/);
    expect(query).not.toHaveBeenCalled();
  });
});
