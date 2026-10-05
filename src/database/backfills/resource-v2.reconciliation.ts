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
  resources_with_owner: number;
  resources_missing_owner: number;
  summary_backfilled: number;
  latest_version_linked: number;
  map_resources: number;
  map_resources_with_version_metadata: number;
  map_resources_missing_version_metadata: number;
  schematic_resources: number;
  schematic_resources_with_version_metadata: number;
  schematic_resources_missing_version_metadata: number;
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
    resourcesWithOwner,
    summaryBackfilled,
    latestVersionLinked,
    mapResources,
    mapResourcesWithMetadata,
    schematicResources,
    schematicResourcesWithMetadata,
  ] = await Promise.all([
    scalarCount(dataSource, `SELECT COUNT(*) AS count FROM \`resources\` WHERE \`deleted_at\` IS NULL`),
    scalarCount(dataSource, `SELECT COUNT(DISTINCT \`resource_id\`) AS count FROM \`resource_attributions\` WHERE \`role\` = 'submitter'`),
    scalarCount(dataSource, `SELECT COUNT(DISTINCT \`resource_id\`) AS count FROM \`resource_versions\` WHERE \`is_legacy_root_release\` = 1`),
    scalarCount(dataSource, `SELECT COUNT(DISTINCT rv.\`resource_id\`) AS count FROM \`resource_files\` rf INNER JOIN \`resource_versions\` rv ON rf.\`resource_version_id\` = rv.\`id\` WHERE rf.\`role\` = 'primary'`),
    scalarCount(dataSource, `SELECT COUNT(DISTINCT \`resource_id\`) AS count FROM \`resource_members\` WHERE \`role\` = 'owner' AND \`status\` = 'active'`),
    scalarCount(dataSource, `SELECT COUNT(*) AS count FROM \`resources\` WHERE \`deleted_at\` IS NULL AND \`summary\` IS NOT NULL AND TRIM(\`summary\`) <> ''`),
    scalarCount(dataSource, `SELECT COUNT(*) AS count FROM \`resources\` WHERE \`deleted_at\` IS NULL AND \`latest_published_version_id\` IS NOT NULL`),
    scalarCount(dataSource, `SELECT COUNT(DISTINCT r.id) AS count FROM resources r WHERE r.deleted_at IS NULL AND r.resource_kind = 'map'`),
    scalarCount(dataSource, `SELECT COUNT(DISTINCT r.id) AS count FROM resources r INNER JOIN resource_versions rv ON rv.resource_id = r.id AND rv.is_legacy_root_release = 1 INNER JOIN map_version_metadata mvm ON mvm.resource_version_id = rv.id WHERE r.deleted_at IS NULL AND r.resource_kind = 'map'`),
    scalarCount(dataSource, `SELECT COUNT(DISTINCT r.id) AS count FROM resources r WHERE r.deleted_at IS NULL AND r.resource_kind = 'schematic'`),
    scalarCount(dataSource, `SELECT COUNT(DISTINCT r.id) AS count FROM resources r INNER JOIN resource_versions rv ON rv.resource_id = r.id AND rv.is_legacy_root_release = 1 INNER JOIN schematic_version_metadata svm ON svm.resource_version_id = rv.id WHERE r.deleted_at IS NULL AND r.resource_kind = 'schematic'`),
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
    resources_with_owner: resourcesWithOwner,
    resources_missing_owner: totalResources - resourcesWithOwner,
    summary_backfilled: summaryBackfilled,
    latest_version_linked: latestVersionLinked,
    map_resources: mapResources,
    map_resources_with_version_metadata: mapResourcesWithMetadata,
    map_resources_missing_version_metadata: mapResources - mapResourcesWithMetadata,
    schematic_resources: schematicResources,
    schematic_resources_with_version_metadata: schematicResourcesWithMetadata,
    schematic_resources_missing_version_metadata: schematicResources - schematicResourcesWithMetadata,
  };
}

async function scalarCount(dataSource: DataSource, sql: string): Promise<number> {
  const rows = await dataSource.query(sql);
  return Number(rows[0]?.count ?? 0);
}
