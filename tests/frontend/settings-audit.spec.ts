import { getSettingsRollbackAudit } from '@/lib/admin/settings-audit';

describe('settings rollback audit eligibility', () => {
  const details = (changes: unknown, source = 'admin-ui', category: unknown = 'brand') => JSON.stringify({ source, category, changes });

  it('allows only admin-ui settings updates with plain string snapshots', () => {
    expect(getSettingsRollbackAudit('settings.update', details({ site_name: { before: 'Old', after: 'New' } })))
      .toEqual({ category: 'brand' });
    expect(getSettingsRollbackAudit('settings.rollback', details({ site_name: { before: 'Old', after: 'New' } })))
      .toBeNull();
    expect(getSettingsRollbackAudit('settings.update', details({ site_name: { before: 'Old', after: 'New' } }, 'import')))
      .toBeNull();
  });

  it('rejects partial, non-string, redacted, and secret snapshots', () => {
    expect(getSettingsRollbackAudit('settings.update', details({ site_name: { before: 'Old', after: 5 } }))).toBeNull();
    expect(getSettingsRollbackAudit('settings.update', details({ api_token: { before: '[redacted]', after: '[redacted]' } }))).toBeNull();
    expect(getSettingsRollbackAudit('settings.update', details({ site_name: { before: '[redacted]', after: 'New' } }))).toBeNull();
    expect(getSettingsRollbackAudit('settings.update', details({}))).toBeNull();
    expect(getSettingsRollbackAudit('settings.update', '{invalid')).toBeNull();
  });
});
