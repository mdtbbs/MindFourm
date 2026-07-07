import { SettingsService } from './settings.service';

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
});
