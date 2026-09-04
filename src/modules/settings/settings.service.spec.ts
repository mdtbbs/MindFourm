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
import { UpdateBrandSettingsDto } from './dto/update-brand-settings.dto';
import { getDefaultSidebarNavigation } from '@common/utils/sidebar-navigation-defaults';
import { validate } from 'class-validator';

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
        key: 'site_footer',
        value: 'Footer text',
        category: 'general',
        description: 'Site footer',
        updated_at: new Date(),
      },
      {
        key: 'brand_primary',
        value: '#2f80ed',
        category: 'general',
        description: 'Brand primary color',
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
      site_footer: 'Footer text',
      brand_primary: '#2f80ed',
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
    // site_name belongs to the brand logical group; site_footer stays in basic
    await expect(service.getByCategory('brand')).resolves.toEqual({
      site_name: 'Forums',
    });
    await expect(service.getByCategory('basic')).resolves.toEqual({
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
        value: 'MDTBBS',
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

      await expect(service.getPublicSettings()).resolves.toEqual({
        site_name: 'MDTBBS',
        site_tagline: '',
        site_description: '',
        site_logo_url: '',
        site_favicon_url: '',
        sidebar_title: '',
        sidebar_logo_url: '',
      });
    });

    it('fills empty-string defaults for brand fields missing from the database', async () => {
      const { service } = createService([
        {
          key: 'site_name',
          value: 'Test Forum',
          category: 'basic',
          description: 'Site name',
          updated_at: new Date(),
        },
      ]);
      await (service as any).loadSettings();

      const result = await service.getPublicSettings();

      expect(result.site_name).toBe('Test Forum');
      expect(result.site_tagline).toBe('');
      expect(result.site_description).toBe('');
      expect(result.site_logo_url).toBe('');
      expect(result.site_favicon_url).toBe('');
      expect(result.sidebar_title).toBe('');
      expect(result.sidebar_logo_url).toBe('');
    });

    it('includes site_favicon_url and sidebar_title when present in the database', async () => {
      const { service } = createService([
        {
          key: 'site_name',
          value: 'Test Forum',
          category: 'basic',
          description: 'Site name',
          updated_at: new Date(),
        },
        {
          key: 'site_favicon_url',
          value: 'https://example.com/favicon.ico',
          category: 'basic',
          description: 'Favicon URL',
          updated_at: new Date(),
        },
        {
          key: 'sidebar_title',
          value: 'Navigation',
          category: 'basic',
          description: 'Sidebar title',
          updated_at: new Date(),
        },
      ]);
      await (service as any).loadSettings();

      const result = await service.getPublicSettings();

      expect(result.site_favicon_url).toBe('https://example.com/favicon.ico');
      expect(result.sidebar_title).toBe('Navigation');
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

  describe('UpdateBrandSettingsDto', () => {
    it('accepts valid brand fields', async () => {
      const dto = new UpdateBrandSettingsDto();
      dto.site_name = 'My Forum';
      dto.site_tagline = 'A great place';
      dto.site_description = 'Description';
      dto.site_logo_url = 'https://example.com/logo.png';
      dto.site_favicon_url = 'https://example.com/favicon.ico';
      dto.sidebar_title = 'Nav';

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('accepts empty strings for URL fields (clearing)', async () => {
      const dto = new UpdateBrandSettingsDto();
      dto.site_logo_url = '';
      dto.site_favicon_url = '';

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('rejects invalid logo URL', async () => {
      const dto = new UpdateBrandSettingsDto();
      dto.site_logo_url = 'not-a-url';

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('site_logo_url');
    });

    it('rejects invalid favicon URL', async () => {
      const dto = new UpdateBrandSettingsDto();
      dto.site_favicon_url = 'javascript:alert(1)';

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('site_favicon_url');
    });

    it('rejects non-string values for string fields', async () => {
      const dto = new UpdateBrandSettingsDto();
      (dto as any).site_name = 123;

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('site_name');
    });
  });

  describe('getSidebarNavigation', () => {
    it('returns sidebar_navigation_items when available', async () => {
      const customItems = [
        {
          id: 'custom',
          label: 'Custom',
          href: '/custom',
          icon: 'Star',
          enabled: true,
          requiresAuth: false,
        },
      ];
      const { service } = createService([
        {
          key: 'sidebar_navigation_items',
          value: JSON.stringify(customItems),
          category: 'navigation',
          description: 'Sidebar nav',
          updated_at: new Date(),
        },
      ]);
      await (service as any).loadSettings();

      const result = await service.getSidebarNavigation();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('custom');
    });

    it('falls back to top_navigation_items when sidebar_navigation_items is empty', async () => {
      const legacyItems = [
        {
          id: 'legacy',
          label: 'Legacy',
          href: '/legacy',
          icon: 'Home',
          enabled: true,
          requiresAuth: false,
        },
      ];
      const { service } = createService([
        { key: 'sidebar_navigation_items', value: '', category: 'navigation', description: '', updated_at: new Date() },
        {
          key: 'top_navigation_items',
          value: JSON.stringify(legacyItems),
          category: 'navigation',
          description: 'Legacy nav',
          updated_at: new Date(),
        },
      ]);
      await (service as any).loadSettings();

      const result = await service.getSidebarNavigation();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('legacy');
    });

    it('falls back to defaults when both settings are empty', async () => {
      const { service } = createService([
        { key: 'sidebar_navigation_items', value: '', category: 'navigation', description: '', updated_at: new Date() },
        { key: 'top_navigation_items', value: '', category: 'navigation', description: '', updated_at: new Date() },
      ]);
      await (service as any).loadSettings();

      const result = await service.getSidebarNavigation();
      const defaults = getDefaultSidebarNavigation();
      expect(result.length).toBeGreaterThan(0);
      expect(result).toEqual(defaults);
    });

    it('falls back to defaults when neither setting exists', async () => {
      const { service } = createService([]);
      await (service as any).loadSettings();

      const result = await service.getSidebarNavigation();
      expect(result).toEqual(getDefaultSidebarNavigation());
    });

    it('skips invalid JSON in sidebar_navigation_items and falls through', async () => {
      const legacyItems = [
        {
          id: 'legacy',
          label: 'Legacy',
          href: '/legacy',
          icon: 'Home',
          enabled: true,
          requiresAuth: false,
        },
      ];
      const { service } = createService([
        { key: 'sidebar_navigation_items', value: 'not json', category: 'navigation', description: '', updated_at: new Date() },
        {
          key: 'top_navigation_items',
          value: JSON.stringify(legacyItems),
          category: 'navigation',
          description: '',
          updated_at: new Date(),
        },
      ]);
      await (service as any).loadSettings();

      const result = await service.getSidebarNavigation();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('legacy');
    });

    it('skips top_navigation_items with incompatible shape and falls through to defaults', async () => {
      // top_navigation_items uses a different schema (type/label/href) that lacks
      // id/icon/enabled/requiresAuth — normalizeSidebarNavigation filters these
      // out, so the result should fall through to the code defaults.
      const legacyTopNav = [{ type: 'link', label: '资源中心', href: '/resources' }];
      const { service } = createService([
        { key: 'sidebar_navigation_items', value: '', category: 'navigation', description: '', updated_at: new Date() },
        {
          key: 'top_navigation_items',
          value: JSON.stringify(legacyTopNav),
          category: 'navigation',
          description: '',
          updated_at: new Date(),
        },
      ]);
      await (service as any).loadSettings();

      const result = await service.getSidebarNavigation();
      expect(result).toEqual(getDefaultSidebarNavigation());
    });
  });

  describe('updateSetting', () => {
    it('updates an existing setting', async () => {
      const { service, query, rows } = createService([
        {
          key: 'sidebar_navigation_items',
          value: '[]',
          category: 'navigation',
          description: 'Sidebar nav',
          updated_at: new Date(),
        },
      ]);
      await (service as any).loadSettings();

      await service.updateSetting('sidebar_navigation_items', '[{"id":"home"}]');

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO settings'),
        ['sidebar_navigation_items', '[{"id":"home"}]', 'navigation', '[{"id":"home"}]', 'navigation'],
      );
      expect(rows.find((r) => r.key === 'sidebar_navigation_items')?.value).toBe('[{"id":"home"}]');
    });

    it('creates a new setting if it does not exist', async () => {
      const { service, query, rows } = createService([]);
      await (service as any).loadSettings();

      await service.updateSetting('new_key', 'new_value');

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO settings'),
        ['new_key', 'new_value', 'general', 'new_value', 'general'],
      );
      expect(rows.find((r) => r.key === 'new_key')?.value).toBe('new_value');
    });

    it('reloads the cache after updating', async () => {
      const { service } = createService([
        {
          key: 'sidebar_navigation_items',
          value: '[]',
          category: 'navigation',
          description: 'Sidebar nav',
          updated_at: new Date(),
        },
      ]);
      await (service as any).loadSettings();

      await service.updateSetting('sidebar_navigation_items', '["updated"]');

      const value = await service.get('sidebar_navigation_items');
      expect(value).toBe('["updated"]');
    });
  });
});
