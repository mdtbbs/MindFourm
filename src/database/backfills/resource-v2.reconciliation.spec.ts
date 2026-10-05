import { runResourceV2Reconciliation } from './resource-v2.reconciliation';

describe('runResourceV2Reconciliation', () => {
  it('produces a reconciliation report from query results', async () => {
    const mockDataSource = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('COUNT(*)') && sql.includes('`resources`') && !sql.includes('summary') && !sql.includes('latest')) return [{ count: 50 }];
        if (sql.includes('COUNT(DISTINCT `resource_id`)') && sql.includes('attributions')) return [{ count: 48 }];
        if (sql.includes('COUNT(DISTINCT `resource_id`)') && sql.includes('resource_members')) return [{ count: 50 }];
        if (sql.includes('COUNT(DISTINCT `resource_id`)') && sql.includes('versions')) return [{ count: 45 }];
        if (sql.includes('COUNT(DISTINCT rv.`resource_id`)')) return [{ count: 44 }];
        if (sql.includes("resource_kind = 'map'") && sql.includes('map_version_metadata')) return [{ count: 7 }];
        if (sql.includes("resource_kind = 'map'")) return [{ count: 8 }];
        if (sql.includes("resource_kind = 'schematic'") && sql.includes('schematic_version_metadata')) return [{ count: 2 }];
        if (sql.includes("resource_kind = 'schematic'")) return [{ count: 3 }];
        if (sql.includes('summary')) return [{ count: 40 }];
        if (sql.includes('latest_published_version_id')) return [{ count: 45 }];
        return [{ count: 0 }];
      }),
    };

    const report = await runResourceV2Reconciliation(mockDataSource as any, new Date('2026-08-10T12:00:00Z'));

    expect(report.generated_at).toBe('2026-08-10T12:00:00.000Z');
    expect(report.total_resources).toBe(50);
    expect(report.resources_with_attribution).toBe(48);
    expect(report.resources_missing_attribution).toBe(2);
    expect(report.resources_with_version).toBe(45);
    expect(report.resources_with_file).toBe(44);
    expect(report.resources_with_owner).toBe(50);
    expect(report.resources_missing_owner).toBe(0);
    expect(report.summary_backfilled).toBe(40);
    expect(report.latest_version_linked).toBe(45);
    expect(report.map_resources_missing_version_metadata).toBe(1);
    expect(report.schematic_resources_missing_version_metadata).toBe(1);
  });
});
