-- Read-only audit for the historical Resource merge twin split described in Issue #71.
-- MySQL 8.0+ (JSON_TABLE). This file contains SELECT statements only.
--
-- The defect window is the source change range [9af8e892, ce095bd7). Do not use
-- attachments_migrated as a filter: that flag only records whether the separate
-- resource_files UPDATE affected rows. See docs/resource-merge-stranded-twins-audit.md.

WITH collision_mappings AS (
  SELECT
    merge_log.id AS merge_log_id,
    merge_log.source_resource_id,
    merge_log.target_resource_id,
    merge_log.created_at,
    mapping.source_version_id,
    mapping.target_version_id
  FROM resource_merge_logs AS merge_log
  JOIN JSON_TABLE(
    merge_log.migrated_counts,
    '$.version_collision_mappings[*]' COLUMNS (
      source_version_id INT PATH '$.source_version_id' NULL ON EMPTY,
      target_version_id INT PATH '$.target_version_id' NULL ON EMPTY
    )
  ) AS mapping
    ON TRUE
  WHERE mapping.source_version_id IS NOT NULL
    AND mapping.target_version_id IS NOT NULL
),
split_rows AS (
  SELECT
    'resource_dependencies' AS stranded_table,
    modern.id AS stranded_row_id,
    legacy.id AS legacy_twin_id,
    modern.resource_version_id AS modern_version_id,
    legacy.resource_version_id AS legacy_version_id,
    JSON_OBJECT(
      'dependency_type', modern.dependency_type,
      'target_resource_id', modern.target_resource_id,
      'external_identifier', modern.external_identifier,
      'upstream_url', modern.upstream_url,
      'version_constraint', modern.version_constraint,
      'notes', modern.notes
    ) AS content_key
  FROM resource_dependencies AS modern
  JOIN resource_version_dependencies AS legacy
    ON legacy.id = modern.legacy_source_id
  WHERE modern.legacy_source_id IS NOT NULL
    AND modern.resource_version_id <> legacy.resource_version_id

  UNION ALL

  SELECT
    'resource_compatibilities' AS stranded_table,
    modern.id AS stranded_row_id,
    legacy.id AS legacy_twin_id,
    modern.resource_version_id AS modern_version_id,
    legacy.resource_version_id AS legacy_version_id,
    JSON_OBJECT(
      'runtime', modern.runtime,
      'platform_key', modern.platform_key,
      'game_version', modern.game_version,
      'min_game_version', modern.min_game_version,
      'max_game_version', modern.max_game_version,
      'channel', modern.channel,
      'status', modern.status,
      'notes', modern.notes
    ) AS content_key
  FROM resource_compatibilities AS modern
  JOIN resource_version_compatibilities AS legacy
    ON legacy.id = modern.legacy_source_id
  WHERE modern.legacy_source_id IS NOT NULL
    AND modern.resource_version_id <> legacy.resource_version_id
)
SELECT
  mapping.source_resource_id AS source_resource_id,
  mapping.target_resource_id AS target_resource_id,
  mapping.created_at AS created_at,
  mapping.source_version_id AS source_version_id,
  mapping.target_version_id AS target_version_id,
  source_version.resource_id AS modern_row_resource_id,
  target_version.resource_id AS legacy_row_resource_id,
  split.stranded_table,
  split.stranded_row_id,
  split.legacy_twin_id,
  split.content_key,
  mapping.merge_log_id,
  CASE
    WHEN mapping.merge_log_id IS NULL THEN 'unattributed_split_needs_manual_review'
    WHEN EXISTS (
      SELECT 1
      FROM resource_merge_logs AS earlier_merge
      WHERE earlier_merge.target_resource_id = mapping.source_resource_id
        AND earlier_merge.id < mapping.merge_log_id
    ) OR EXISTS (
      SELECT 1
      FROM resource_merge_logs AS later_merge
      WHERE later_merge.source_resource_id = mapping.target_resource_id
        AND later_merge.id > mapping.merge_log_id
    ) THEN 'matched_but_multihop_needs_manual_review'
    ELSE 'matched_version_collision_mapping'
  END AS attribution,
  target_resource.status AS target_resource_status,
  target_resource.is_public AS target_is_public,
  CASE
    WHEN mapping.merge_log_id IS NULL THEN NULL
    WHEN target_resource.status IN ('approved', 'published')
      AND target_resource.is_public = 1 THEN 1
    ELSE 0
  END AS p1_public_target_candidate
FROM split_rows AS split
JOIN resource_versions AS source_version
  ON source_version.id = split.modern_version_id
JOIN resource_versions AS target_version
  ON target_version.id = split.legacy_version_id
LEFT JOIN collision_mappings AS mapping
  ON mapping.source_version_id = split.modern_version_id
 AND mapping.target_version_id = split.legacy_version_id
LEFT JOIN resources AS target_resource
  ON target_resource.id = COALESCE(mapping.target_resource_id, target_version.resource_id)
ORDER BY
  mapping.created_at,
  source_resource_id,
  target_resource_id,
  source_version_id,
  target_version_id,
  split.stranded_table,
  split.stranded_row_id;

-- One row per merge log with at least one version collision. The P1 trigger
-- counts public targets across all such logs; it is independent of the
-- historical split-row attribution window above.
WITH collision_mappings AS (
  SELECT
    merge_log.id AS merge_log_id,
    merge_log.source_resource_id,
    merge_log.target_resource_id,
    merge_log.created_at,
    mapping.source_version_id,
    mapping.target_version_id
  FROM resource_merge_logs AS merge_log
  JOIN JSON_TABLE(
    merge_log.migrated_counts,
    '$.version_collision_mappings[*]' COLUMNS (
      source_version_id INT PATH '$.source_version_id' NULL ON EMPTY,
      target_version_id INT PATH '$.target_version_id' NULL ON EMPTY
    )
  ) AS mapping
    ON TRUE
  WHERE mapping.source_version_id IS NOT NULL
    AND mapping.target_version_id IS NOT NULL
),
merge_candidates AS (
  SELECT
    merge_log_id,
    source_resource_id,
    target_resource_id,
    created_at,
    COUNT(*) AS version_collision_count
  FROM collision_mappings
  GROUP BY merge_log_id, source_resource_id, target_resource_id, created_at
)
SELECT
  candidate.merge_log_id,
  candidate.source_resource_id,
  candidate.target_resource_id,
  candidate.created_at,
  candidate.version_collision_count,
  target_resource.status AS target_resource_status,
  target_resource.is_public AS target_is_public,
  CASE
    WHEN target_resource.status IN ('approved', 'published')
      AND target_resource.is_public = 1 THEN 1
    ELSE 0
  END AS p1_trigger_candidate
FROM merge_candidates AS candidate
LEFT JOIN resources AS target_resource
  ON target_resource.id = candidate.target_resource_id
ORDER BY candidate.created_at, candidate.merge_log_id;
