import { MessagePrivacySetting1720000250000 } from './1720000250000-MessagePrivacySetting';

describe('MessagePrivacySetting1720000250000', () => {
  it('adds a MySQL 5.7-compatible enum with the backward-compatible everyone default', async () => {
    const query = jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce(undefined);
    await new MessagePrivacySetting1720000250000().up({ query } as any);
    expect(query.mock.calls[0][0]).toContain("SHOW COLUMNS FROM social_privacy_settings LIKE 'allow_messages'");
    expect(query.mock.calls[1][0]).toContain("ENUM('everyone', 'friends', 'nobody') NOT NULL DEFAULT 'everyone'");
  });

  it('does not re-add an already present column', async () => {
    const query = jest.fn().mockResolvedValueOnce([{ Field: 'allow_messages' }]);
    await new MessagePrivacySetting1720000250000().up({ query } as any);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('preserves configured privacy on rollback', async () => {
    const query = jest.fn();
    await new MessagePrivacySetting1720000250000().down({ query } as any);
    expect(query).not.toHaveBeenCalled();
  });
});
