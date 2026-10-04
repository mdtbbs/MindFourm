import { ModReportAttachments1720000280000 } from './1720000280000-ModReportAttachments';

describe('ModReportAttachments migration', () => {
  it('creates private report attachment rows with UUIDs and report/user cascades', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration = new ModReportAttachments1720000280000();

    await migration.up({ query } as any);

    expect(query).toHaveBeenCalledTimes(1);
    const statement = String(query.mock.calls[0][0]);
    expect(statement).toContain('CREATE TABLE IF NOT EXISTS mod_report_attachments');
    expect(statement).toContain('public_id CHAR(36) NOT NULL');
    expect(statement).toContain('file_path TEXT NOT NULL');
    expect(statement).toContain('FOREIGN KEY (issue_report_id) REFERENCES mod_issue_reports(id) ON DELETE CASCADE');
    expect(statement).toContain('FOREIGN KEY (compatibility_report_id) REFERENCES mod_compatibility_reports(id) ON DELETE CASCADE');
    expect(statement).toContain('FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL');
  });

  it('drops only the additive table on rollback', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await new ModReportAttachments1720000280000().down({ query } as any);
    expect(query).toHaveBeenCalledWith('DROP TABLE IF EXISTS mod_report_attachments');
  });
});
