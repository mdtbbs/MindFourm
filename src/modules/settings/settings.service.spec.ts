const decorator = () => () => undefined;

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

jest.mock('typeorm', () => ({
  Repository: class Repository {},
  Entity: decorator,
  PrimaryGeneratedColumn: decorator,
  PrimaryColumn: decorator,
  Column: decorator,
  ManyToOne: decorator,
  OneToMany: decorator,
  ManyToMany: decorator,
  OneToOne: decorator,
  JoinColumn: decorator,
  JoinTable: decorator,
  CreateDateColumn: decorator,
  UpdateDateColumn: decorator,
  DeleteDateColumn: decorator,
  Index: decorator,
  Unique: decorator,
}));

jest.mock('@entities/setting.entity', () => ({ Setting: class Setting {} }));

import { SECRET_PLACEHOLDER, SettingsService } from './settings.service';

type SettingRow = {
  key: string;
  value: string;
  category: string;
  description: string | null;
  updated_at: Date;
};

function createService(initialRows: SettingRow[]) {
  const rows = initialRows.map((row) => ({ ...row }));
  const query = jest.fn(async (_sql: string, params: [string, string, string, string, string]) => {
    const [key, value, category, duplicateValue, duplicateCategory] = params;

    if (value !== duplicateValue || category !== duplicateCategory) {
      throw new Error('Unexpected duplicate-key update params');
    }

    const existing = rows.find((row) => row.key === key);
    if (existing) {
      existing.value = value;
      existing.category = category;
      existing.updated_at = new Date();
      return [];
    }

    rows.push({
      key,
      value,
      category,
      description: null,
      updated_at: new Date(),
    });
    return [];
  });
  const find = jest.fn(async () => rows.map((row) => ({ ...row })));

  return {
    rows,
    query,
    find,
    service: new SettingsService({ query, find } as any),
  };
}

describe('SettingsService', () => {
  it('loads basic settings from legacy rows stored under the general category', async () => {
    const { service } = createService([
      {
        key: 'site_name',
        value: 'Legacy Forum',
        category: 'general',
        description: 'Site name',
        updated_at: new Date(),
      },
      {
        key: 'site_description',
        value: 'Legacy description',
        category: 'general',
        description: 'Site description',
        updated_at: new Date(),
      },
      {
        key: 'latest_posts_title',
        value: 'Latest Posts',
        category: 'display',
        description: 'Latest posts section title',
        updated_at: new Date(),
      },
    ]);

    await (service as any).loadSettings();

    await expect(service.getByCategory('basic')).resolves.toEqual({
      site_name: 'Legacy Forum',
      site_description: 'Legacy description',
    });
  });

  it('quotes reserved column names and migrates duplicate keys into the requested category', async () => {
    const { service, query, rows } = createService([
      {
        key: 'site_name',
        value: 'Legacy Forum',
        category: 'general',
        description: 'Site name',
        updated_at: new Date(),
      },
    ]);

    await (service as any).loadSettings();
    await service.setBatch('basic', {
      site_name: 'Forums',
      site_footer: 'Footer text',
    });

    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INSERT INTO settings (`key`, `value`, category, updated_at)'),
      ['site_name', 'Forums', 'basic', 'Forums', 'basic'],
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('ON DUPLICATE KEY UPDATE `value` = ?, category = ?, updated_at = NOW()'),
      ['site_footer', 'Footer text', 'basic', 'Footer text', 'basic'],
    );

    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'site_name', value: 'Forums', category: 'basic' }),
      expect.objectContaining({ key: 'site_footer', value: 'Footer text', category: 'basic' }),
    ]));
    await expect(service.getByCategory('basic')).resolves.toEqual({
      site_name: 'Forums',
      site_footer: 'Footer text',
    });
  });

  it('groups webhook channel settings under the notifications category', async () => {
    const { service } = createService([
      {
        key: 'admin_notifications_enabled',
        value: 'true',
        category: 'notifications',
        description: 'Enable admin notifications',
        updated_at: new Date(),
      },
      {
        key: 'admin_notifications_webhook_enabled',
        value: 'true',
        category: 'notifications',
        description: 'Enable admin notification webhooks',
        updated_at: new Date(),
      },
      {
        key: 'admin_notifications_webhook_url',
        value: 'https://example.com/hooks/admin',
        category: 'notifications',
        description: 'Admin notification webhook URL',
        updated_at: new Date(),
      },
    ]);

    await (service as any).loadSettings();

    await expect(service.getByCategory('notifications')).resolves.toEqual({
      admin_notifications_enabled: 'true',
      admin_notifications_webhook_enabled: 'true',
      admin_notifications_webhook_url: 'https://example.com/hooks/admin',
    });
  });

  describe('public exposure', () => {
    const sensitiveRows: SettingRow[] = [
      {
        key: 'site_name',
        value: 'MindFourm',
        category: 'basic',
        description: 'Site name',
        updated_at: new Date(),
      },
      {
        key: 'admin_email',
        value: 'admin@example.com',
        category: 'basic',
        description: 'Admin email',
        updated_at: new Date(),
      },
      {
        key: 'smtp_host',
        value: 'smtp.example.com',
        category: 'email',
        description: 'SMTP host',
        updated_at: new Date(),
      },
      {
        key: 'smtp_user',
        value: 'mailer',
        category: 'email',
        description: 'SMTP username',
        updated_at: new Date(),
      },
      {
        key: 'smtp_password',
        value: 'super-secret',
        category: 'email',
        description: 'SMTP password',
        updated_at: new Date(),
      },
      {
        key: 'admin_notifications_webhook_secret',
        value: 'hmac-key',
        category: 'notifications',
        description: 'Webhook secret',
        updated_at: new Date(),
      },
      {
        key: 'admin_notifications_webhook_url',
        value: 'https://example.com/hooks/admin',
        category: 'notifications',
        description: 'Webhook URL',
        updated_at: new Date(),
      },
    ];

    it('omits credentials and other non-allowlisted keys from the public payload', async () => {
      const { service } = createService(sensitiveRows);
      await (service as any).loadSettings();

      await expect(service.getPublicSettings()).resolves.toEqual({ site_name: 'MindFourm' });
    });

    it('returns nothing public for credential-bearing categories', async () => {
      const { service } = createService(sensitiveRows);
      await (service as any).loadSettings();

      await expect(service.getPublicByCategory('email')).resolves.toEqual({});
      await expect(service.getPublicByCategory('notifications')).resolves.toEqual({});
    });

    it('masks secrets for admins but keeps editable non-secret values readable', async () => {
      const { service } = createService(sensitiveRows);
      await (service as any).loadSettings();

      const adminView = await service.getAllForAdmin();

      expect(adminView.smtp_password).toBe(SECRET_PLACEHOLDER);
      expect(adminView.admin_notifications_webhook_secret).toBe(SECRET_PLACEHOLDER);
      expect(adminView.smtp_user).toBe('mailer');
      expect(adminView.admin_notifications_webhook_url).toBe('https://example.com/hooks/admin');
      expect(adminView.admin_email).toBe('admin@example.com');
    });

    it('leaves an unset secret as an empty string rather than masking it', async () => {
      const { service } = createService([
        {
          key: 'smtp_password',
          value: '',
          category: 'email',
          description: 'SMTP password',
          updated_at: new Date(),
        },
      ]);
      await (service as any).loadSettings();

      await expect(service.getByCategoryForAdmin('email')).resolves.toEqual({ smtp_password: '' });
    });

    it('keeps the stored secret when the masked placeholder is posted back', async () => {
      const { service, query, rows } = createService(sensitiveRows);
      await (service as any).loadSettings();

      await service.setBatch('email', {
        smtp_host: 'smtp.new.example.com',
        smtp_password: SECRET_PLACEHOLDER,
      });

      expect(query).toHaveBeenCalledTimes(1);
      expect(query).toHaveBeenCalledWith(expect.any(String), [
        'smtp_host',
        'smtp.new.example.com',
        'email',
        'smtp.new.example.com',
        'email',
      ]);
      expect(rows.find((row) => row.key === 'smtp_password')?.value).toBe('super-secret');
    });

    it('still allows an explicit empty value to clear a secret', async () => {
      const { service, rows } = createService(sensitiveRows);
      await (service as any).loadSettings();

      await service.setBatch('email', { smtp_password: '' });

      expect(rows.find((row) => row.key === 'smtp_password')?.value).toBe('');
    });
  });
});
