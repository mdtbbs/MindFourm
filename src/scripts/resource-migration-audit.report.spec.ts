import { buildResourceMigrationAudit } from './resource-migration-audit.report';

describe('buildResourceMigrationAudit', () => {
  it('reports counts, Legacy anomalies, and the historical download baseline', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes("SUM(`download_count`)")) return [{ count: 1382 }];
      if (sql.includes("FROM `resource_versions`") && sql.includes("TRIM(COALESCE(`version`, ''))")) return [{ count: 1 }];
      if (sql.includes("FROM `resource_versions`") && sql.includes("`file_path` IS NULL")) return [{ count: 3 }];
      if (sql.includes("FROM `resource_versions`")) return [{ count: 9 }];
      if (sql.includes("`resource_type` = 'external'")) return [{ count: 3 }];
      if (sql.includes("`use_mfl` = 1")) return [{ count: 4 }];
      if (sql.includes("TRIM(COALESCE(`version`, '')) = ''") && sql.includes("FROM `resources`")) return [{ count: 2 }];
      if (sql.includes("`file_path` IS NULL")) return [{ count: 5 }];
      if (sql.includes("`status` = 'pending'")) return [{ count: 7 }];
      if (sql.includes("`status` = 'rejected'")) return [{ count: 1 }];
      if (sql.includes("`deleted_at` IS NOT NULL")) return [{ count: 6 }];
      if (sql.includes("`is_active` = 0")) return [{ count: 2 }];
      if (sql.includes("TRIM(COALESCE(`description`, ''))")) return [{ count: 4 }];
      if (sql.includes("FROM `resources` WHERE `deleted_at` IS NULL")) return [{ count: 12 }];
      return [{ count: 0 }];
    });

    await expect(buildResourceMigrationAudit(query, new Date('2026-08-10T00:00:00.000Z')))
      .resolves.toMatchObject({
        generated_at: '2026-08-10T00:00:00.000Z',
        counts: {
          active_resources: 12,
          resource_versions: 9,
          external_resources: 3,
          mfl_resources: 4,
          pending_resources: 7,
          rejected_resources: 1,
          soft_deleted_resources: 6,
          disabled_category_resources: 2,
        },
        anomalies: {
          resources_without_version: 2,
          resources_without_local_file_path: 5,
          version_rows_with_blank_version: 1,
          version_rows_without_file_path: 3,
          blank_description_resources: 4,
        },
        legacy_download_baseline: 1382,
      });
  });

  it('ensures all queries are SELECT-only', async () => {
    const queries: string[] = [];
    const query = jest.fn(async (sql: string) => {
      queries.push(sql);
      return [{ count: 0 }];
    });

    await buildResourceMigrationAudit(query, new Date());

    for (const q of queries) {
      expect(q.trim().toUpperCase()).toMatch(/^SELECT/);
    }
  });
});
