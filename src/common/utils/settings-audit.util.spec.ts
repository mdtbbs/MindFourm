import { createSettingsAuditDetails, getSettingsRollbackValues } from './settings-audit.util';

describe('createSettingsAuditDetails', () => {
  it('records request context and before/after values while redacting secret settings', () => {
    expect(createSettingsAuditDetails('email', {
      smtp_host: 'mail.old.test',
      smtp_password: '__unchanged__',
      custom_api_token: 'old-secret',
    }, {
      smtp_host: 'mail.new.test',
      smtp_password: 'new-secret',
      custom_api_token: 'new-secret',
    }, 'req-123')).toEqual({
      source: 'admin-ui',
      request_id: 'req-123',
      category: 'email',
      changes: {
        smtp_host: { before: 'mail.old.test', after: 'mail.new.test' },
        smtp_password: { before: '[redacted]', after: '[redacted]' },
        custom_api_token: { before: '[redacted]', after: '[redacted]' },
      },
    });
  });

  it('bounds large values and large setting batches', () => {
    const changes = Object.fromEntries(Array.from({ length: 102 }, (_, index) => [`setting_${index}`, 'x'.repeat(4100)]));
    const result = createSettingsAuditDetails('brand', {}, changes) as any;
    expect(Object.keys(result.changes)).toHaveLength(100);
    expect(result.omitted_change_count).toBe(2);
    expect(result.changes.setting_0.after).toHaveLength(4012);
    expect(result).not.toHaveProperty('request_id');
  });

  it('allows rollback only when every audited field still matches and snapshots are not secret', () => {
    const details = JSON.stringify({
      source: 'admin-ui', category: 'brand', changes: {
        site_name: { before: 'Old', after: 'New' },
      },
    });
    expect(getSettingsRollbackValues(details, 'brand', { site_name: 'New' })).toEqual({ site_name: 'Old' });
    expect(getSettingsRollbackValues(details, 'brand', { site_name: 'Later edit' })).toBeNull();
    expect(getSettingsRollbackValues(details, 'email', { site_name: 'New' })).toBeNull();
    expect(getSettingsRollbackValues(JSON.stringify({
      source: 'admin-ui', category: 'email', changes: { smtp_password: { before: '[redacted]', after: '[redacted]' } },
    }), 'email', { smtp_password: '__unchanged__' })).toBeNull();
  });
});
