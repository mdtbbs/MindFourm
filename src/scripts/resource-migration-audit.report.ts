export type Query = (sql: string, parameters?: unknown[]) => Promise<Array<Record<string, unknown>>>;

export type ResourceMigrationAuditReport = {
  generated_at: string;
  counts: Record<string, number>;
  anomalies: Record<string, number>;
  legacy_download_baseline: number;
};

async function scalarCount(query: Query, sql: string): Promise<number> {
  const rows = await query(sql);
  return Number(rows[0]?.count ?? 0);
}

export async function buildResourceMigrationAudit(
  query: Query,
  generatedAt: Date,
): Promise<ResourceMigrationAuditReport> {
  const [
    activeResources,
    resourceVersions,
    externalResources,
    mflResources,
    resourcesWithoutVersion,
    resourcesWithoutLocalFilePath,
    legacyDownloadBaseline,
    pendingResources,
    rejectedResources,
    softDeletedResources,
    disabledCategoryResources,
    versionRowsWithBlankVersion,
    versionRowsWithoutFilePath,
    blankDescriptionResources,
  ] = await Promise.all([
    scalarCount(query, "SELECT COUNT(*) AS count FROM `resources` WHERE `deleted_at` IS NULL"),
    scalarCount(query, "SELECT COUNT(*) AS count FROM `resource_versions`"),
    scalarCount(query, "SELECT COUNT(*) AS count FROM `resources` WHERE `deleted_at` IS NULL AND `resource_type` = 'external'"),
    scalarCount(query, "SELECT COUNT(*) AS count FROM `resources` WHERE `deleted_at` IS NULL AND `use_mfl` = 1"),
    scalarCount(query, "SELECT COUNT(*) AS count FROM `resources` WHERE `deleted_at` IS NULL AND TRIM(COALESCE(`version`, '')) = ''"),
    scalarCount(query, "SELECT COUNT(*) AS count FROM `resources` WHERE `deleted_at` IS NULL AND `resource_type` = 'upload' AND `use_mfl` = 0 AND `file_path` IS NULL"),
    scalarCount(query, "SELECT COALESCE(SUM(`download_count`), 0) AS count FROM `resources` WHERE `deleted_at` IS NULL"),
    scalarCount(query, "SELECT COUNT(*) AS count FROM `resources` WHERE `deleted_at` IS NULL AND `status` = 'pending'"),
    scalarCount(query, "SELECT COUNT(*) AS count FROM `resources` WHERE `deleted_at` IS NULL AND `status` = 'rejected'"),
    scalarCount(query, "SELECT COUNT(*) AS count FROM `resources` WHERE `deleted_at` IS NOT NULL"),
    scalarCount(query, "SELECT COUNT(*) AS count FROM `resources` WHERE `deleted_at` IS NULL AND `category_id` IS NOT NULL AND `category_id` IN (SELECT `id` FROM `resource_categories` WHERE `is_active` = 0)"),
    scalarCount(query, "SELECT COUNT(*) AS count FROM `resource_versions` WHERE TRIM(COALESCE(`version`, '')) = ''"),
    scalarCount(query, "SELECT COUNT(*) AS count FROM `resource_versions` WHERE `file_path` IS NULL"),
    scalarCount(query, "SELECT COUNT(*) AS count FROM `resources` WHERE `deleted_at` IS NULL AND TRIM(COALESCE(`description`, '')) = ''"),
  ]);

  return {
    generated_at: generatedAt.toISOString(),
    counts: {
      active_resources: activeResources,
      resource_versions: resourceVersions,
      external_resources: externalResources,
      mfl_resources: mflResources,
      pending_resources: pendingResources,
      rejected_resources: rejectedResources,
      soft_deleted_resources: softDeletedResources,
      disabled_category_resources: disabledCategoryResources,
    },
    anomalies: {
      resources_without_version: resourcesWithoutVersion,
      resources_without_local_file_path: resourcesWithoutLocalFilePath,
      version_rows_with_blank_version: versionRowsWithBlankVersion,
      version_rows_without_file_path: versionRowsWithoutFilePath,
      blank_description_resources: blankDescriptionResources,
    },
    legacy_download_baseline: legacyDownloadBaseline,
  };
}
