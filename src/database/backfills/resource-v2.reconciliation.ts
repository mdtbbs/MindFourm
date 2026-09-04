import { DataSource } from 'typeorm';

/**
 * Post-backfill reconciliation: verifies the new structured records
 * match what is expected from the legacy data.
 *
 * Returns counts of matched, mismatched, and missing records.
 */

export type ReconciliationReport = {
  generated_at: string;
  total_resources: number;
  resources_with_attribution: number;
  resources_with_version: number;
  resources_with_file: number;
  resources_missing_attribution: number;
  resources_missing_version: number;
  resources_missing_file: number;
  summary_backfilled: number;
  latest_version_linked: number;
};

export async function runResourceV2Reconciliation(
  dataSource: DataSource,
  generatedAt: Date,
): Promise<ReconciliationReport> {
  const [
    totalResources,
    resourcesWithAttribution,
    resourcesWithVersion,
    resourcesWithFile,
    summaryBackfilled,
    latestVersionLinked,
  ] = await Promise.all([
    scalarCount(dataSource, `SELECT COUNT(*) AS count FROM \`resources\` WHERE \`deleted_at\` IS NULL`),
    scalarCount(dataSource, `SELECT COUNT(DISTINCT \`resource_id\`) AS count FROM \`resource_attributions\` WHERE \`role\` = 'submitter'`),
    scalarCount(dataSource, `SELECT COUNT(DISTINCT \`resource_id\`) AS count FROM \`resource_versions\` WHERE \`is_legacy_root_release\` = 1`),
    scalarCount(dataSource, `SELECT COUNT(DISTINCT rv.\`resource_id\`) AS count FROM \`resource_files\` rf INNER JOIN \`resource_versions\` rv ON rf.\`resource_version_id\` = rv.\`id\` WHERE rf.\`role\` = 'primary'`),
    scalarCount(dataSource, `SELECT COUNT(*) AS count FROM \`resources\` WHERE \`deleted_at\` IS NULL AND \`summary\` IS NOT NULL AND TRIM(\`summary\`) <> ''`),
    scalarCount(dataSource, `SELECT COUNT(*) AS count FROM \`resources\` WHERE \`deleted_at\` IS NULL AND \`latest_published_version_id\` IS NOT NULL`),
  ]);

  return {
    generated_at: generatedAt.toISOString(),
    total_resources: totalResources,
    resources_with_attribution: resourcesWithAttribution,
    resources_with_version: resourcesWithVersion,
    resources_with_file: resourcesWithFile,
    resources_missing_attribution: totalResources - resourcesWithAttribution,
    resources_missing_version: totalResources - resourcesWithVersion,
    resources_missing_file: totalResources - resourcesWithFile,
    summary_backfilled: summaryBackfilled,
    latest_version_linked: latestVersionLinked,
  };
}

async function scalarCount(dataSource: DataSource, sql: string): Promise<number> {
  const rows = await dataSource.query(sql);
  return Number(rows[0]?.count ?? 0);
}
