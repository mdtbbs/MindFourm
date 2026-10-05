import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  addColumnIfMissing, addUniqueIfMissing, columnExists, createIndexIfMissing, dropIndexIfPresent,
  tableExists,
} from './migration-utils';

const tables = [
  `CREATE TABLE IF NOT EXISTS resource_members (
    id INT NOT NULL AUTO_INCREMENT, resource_id INT NOT NULL, user_id INT NOT NULL,
    role VARCHAR(24) NOT NULL, status VARCHAR(24) NOT NULL DEFAULT 'active', invited_by_user_id INT NULL,
    accepted_at DATETIME NULL, created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id), UNIQUE KEY uq_resource_members_resource_user (resource_id,user_id),
    KEY idx_resource_members_user_status (user_id,status),
    CONSTRAINT fk_rcv2_members_resource FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
    CONSTRAINT fk_rcv2_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_rcv2_members_inviter FOREIGN KEY (invited_by_user_id) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS resource_relations (
    id INT NOT NULL AUTO_INCREMENT, source_resource_id INT NOT NULL, target_resource_id INT NOT NULL,
    source_version_id INT NULL, target_version_id INT NULL, relation_type VARCHAR(40) NOT NULL,
    relation_context VARCHAR(32) NOT NULL DEFAULT 'general',
    created_by_user_id INT NULL, created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id), UNIQUE KEY uq_resource_relations_pair_context (source_resource_id,target_resource_id,relation_type,relation_context),
    KEY idx_resource_relations_target (target_resource_id,relation_type),
    CONSTRAINT fk_rcv2_relations_source FOREIGN KEY (source_resource_id) REFERENCES resources(id) ON DELETE CASCADE,
    CONSTRAINT fk_rcv2_relations_target FOREIGN KEY (target_resource_id) REFERENCES resources(id) ON DELETE CASCADE,
    CONSTRAINT fk_rcv2_relations_src_ver FOREIGN KEY (source_version_id) REFERENCES resource_versions(id) ON DELETE SET NULL,
    CONSTRAINT fk_rcv2_relations_dst_ver FOREIGN KEY (target_version_id) REFERENCES resource_versions(id) ON DELETE SET NULL,
    CONSTRAINT fk_rcv2_relations_actor FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS resource_review_events (
    id INT NOT NULL AUTO_INCREMENT, resource_id INT NOT NULL, resource_version_id INT NULL,
    actor_user_id INT NULL, event_type VARCHAR(32) NOT NULL, result VARCHAR(32) NULL, reason TEXT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (id),
    KEY idx_resource_review_events_resource (resource_id,created_at,id),
    KEY idx_resource_review_events_version (resource_version_id,created_at),
    CONSTRAINT fk_rcv2_review_events_resource FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
    CONSTRAINT fk_rcv2_review_events_version FOREIGN KEY (resource_version_id) REFERENCES resource_versions(id) ON DELETE SET NULL,
    CONSTRAINT fk_rcv2_review_events_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS resource_review_annotations (
    id INT NOT NULL AUTO_INCREMENT, review_event_id INT NOT NULL, resource_id INT NOT NULL,
    field_path VARCHAR(191) NOT NULL, severity VARCHAR(16) NOT NULL DEFAULT 'INFO', body TEXT NOT NULL,
    created_by_user_id INT NULL, created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id), KEY idx_resource_review_annotations_event (review_event_id,id),
    KEY idx_resource_review_annotations_resource_field (resource_id,field_path),
    CONSTRAINT fk_rcv2_review_annotations_event FOREIGN KEY (review_event_id) REFERENCES resource_review_events(id) ON DELETE CASCADE,
    CONSTRAINT fk_rcv2_review_annotations_resource FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
    CONSTRAINT fk_rcv2_review_annotations_actor FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS resource_analysis_runs (
    id INT NOT NULL AUTO_INCREMENT, resource_id INT NOT NULL, resource_version_id INT NOT NULL,
    analyzer VARCHAR(64) NOT NULL, parser_version VARCHAR(100) NOT NULL, status VARCHAR(24) NOT NULL DEFAULT 'completed',
    summary_json JSON NULL, findings_json JSON NULL, started_at DATETIME NULL, completed_at DATETIME NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (id),
    KEY idx_resource_analysis_runs_resource (resource_id,created_at),
    KEY idx_resource_analysis_runs_version (resource_version_id,created_at),
    CONSTRAINT fk_rcv2_analysis_runs_resource FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
    CONSTRAINT fk_rcv2_analysis_runs_version FOREIGN KEY (resource_version_id) REFERENCES resource_versions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS resource_analysis_overrides (
    id INT NOT NULL AUTO_INCREMENT, analysis_run_id INT NOT NULL, finding_key VARCHAR(191) NOT NULL,
    actor_user_id INT NOT NULL, reason TEXT NOT NULL, created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id), UNIQUE KEY uq_resource_analysis_override_finding (analysis_run_id,finding_key),
    CONSTRAINT fk_rcv2_analysis_overrides_run FOREIGN KEY (analysis_run_id) REFERENCES resource_analysis_runs(id) ON DELETE CASCADE,
    CONSTRAINT fk_rcv2_analysis_overrides_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS resource_compatibilities (
    id INT NOT NULL AUTO_INCREMENT, resource_version_id INT NOT NULL, source VARCHAR(24) NOT NULL,
    runtime VARCHAR(50) NOT NULL DEFAULT 'mindustry', platform_key VARCHAR(50) NULL, game_version VARCHAR(80) NULL,
    min_game_version VARCHAR(80) NULL, max_game_version VARCHAR(80) NULL, channel VARCHAR(50) NULL,
    status VARCHAR(32) NULL, confidence VARCHAR(16) NULL, notes TEXT NULL, created_by_user_id INT NULL,
    legacy_source_id INT NULL, created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id), UNIQUE KEY uq_resource_compatibilities_legacy (legacy_source_id),
    KEY idx_resource_compatibilities_version_source (resource_version_id,source),
    KEY idx_resource_compatibilities_game_version (runtime,game_version,platform_key),
    CONSTRAINT fk_rcv2_compat_version FOREIGN KEY (resource_version_id) REFERENCES resource_versions(id) ON DELETE CASCADE,
    CONSTRAINT fk_rcv2_compat_actor FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS resource_dependencies (
    id INT NOT NULL AUTO_INCREMENT, resource_version_id INT NOT NULL, dependency_type VARCHAR(24) NOT NULL,
    target_resource_id INT NULL, external_identifier VARCHAR(255) NULL, upstream_url VARCHAR(500) NULL,
    version_constraint VARCHAR(255) NULL, resolution_status VARCHAR(24) NOT NULL DEFAULT 'unresolved',
    notes TEXT NULL, sort_order INT UNSIGNED NOT NULL DEFAULT 0, legacy_source_id INT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (id),
    UNIQUE KEY uq_resource_dependencies_legacy (legacy_source_id),
    KEY idx_resource_dependencies_version_type (resource_version_id,dependency_type),
    KEY idx_resource_dependencies_target (target_resource_id),
    CONSTRAINT fk_rcv2_dependencies_version FOREIGN KEY (resource_version_id) REFERENCES resource_versions(id) ON DELETE CASCADE,
    CONSTRAINT fk_rcv2_dependencies_target FOREIGN KEY (target_resource_id) REFERENCES resources(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS resource_version_diffs (
    id INT NOT NULL AUTO_INCREMENT, resource_id INT NOT NULL, from_version_id INT NOT NULL, to_version_id INT NOT NULL,
    diff_json JSON NOT NULL, parser_version VARCHAR(100) NOT NULL, status VARCHAR(24) NOT NULL DEFAULT 'completed',
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (id),
    UNIQUE KEY uq_resource_version_diffs_pair (from_version_id,to_version_id),
    KEY idx_resource_version_diffs_resource (resource_id,created_at),
    CONSTRAINT fk_rcv2_diffs_resource FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
    CONSTRAINT fk_rcv2_diffs_from FOREIGN KEY (from_version_id) REFERENCES resource_versions(id) ON DELETE CASCADE,
    CONSTRAINT fk_rcv2_diffs_to FOREIGN KEY (to_version_id) REFERENCES resource_versions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS resource_source_syncs (
    id INT NOT NULL AUTO_INCREMENT, resource_id INT NOT NULL, provider VARCHAR(32) NOT NULL, repository_url VARCHAR(500) NOT NULL,
    enabled TINYINT UNSIGNED NOT NULL DEFAULT 0, stable_only TINYINT UNSIGNED NOT NULL DEFAULT 1,
    include_prerelease TINYINT UNSIGNED NOT NULL DEFAULT 0, asset_include_json JSON NULL, asset_exclude_json JSON NULL,
    last_polled_at DATETIME NULL, last_status VARCHAR(32) NULL, last_error TEXT NULL, upstream_tag VARCHAR(191) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id), UNIQUE KEY uq_resource_source_syncs_provider_repo (resource_id,provider,repository_url),
    KEY idx_resource_source_syncs_poll (enabled,last_polled_at),
    CONSTRAINT fk_rcv2_source_sync_resource FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS mod_profiles (
    id INT NOT NULL AUTO_INCREMENT, resource_id INT NOT NULL, mod_id VARCHAR(191) NOT NULL,
    display_name VARCHAR(255) NULL, runtime_type VARCHAR(24) NULL, description TEXT NULL, upstream_url VARCHAR(500) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id), UNIQUE KEY uq_mod_profiles_resource (resource_id), UNIQUE KEY uq_mod_profiles_mod_id (mod_id),
    CONSTRAINT fk_rcv2_mod_profiles_resource FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS mod_id_aliases (
    id INT NOT NULL AUTO_INCREMENT, resource_id INT NOT NULL, alias VARCHAR(191) NOT NULL, created_by_user_id INT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (id), UNIQUE KEY uq_mod_id_aliases_alias (alias),
    KEY idx_mod_id_aliases_resource (resource_id),
    CONSTRAINT fk_rcv2_mod_alias_resource FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
    CONSTRAINT fk_rcv2_mod_alias_actor FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS mod_version_metadata (
    id INT NOT NULL AUTO_INCREMENT, resource_version_id INT NOT NULL, parser_version VARCHAR(100) NULL, runtime_type VARCHAR(24) NULL,
    manifest_name VARCHAR(255) NULL, display_name VARCHAR(255) NULL, author VARCHAR(255) NULL, version VARCHAR(100) NULL,
    min_game_version VARCHAR(80) NULL, description TEXT NULL, main_class VARCHAR(255) NULL, package_name VARCHAR(255) NULL,
    archive_files_json JSON NULL,
    parsed_manifest_json JSON NULL, author_overrides_json JSON NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id), UNIQUE KEY uq_mod_version_metadata_version (resource_version_id),
    CONSTRAINT fk_rcv2_mod_version_metadata_version FOREIGN KEY (resource_version_id) REFERENCES resource_versions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS mod_contents (
    id INT NOT NULL AUTO_INCREMENT, public_id CHAR(36) NOT NULL, resource_version_id INT NOT NULL, content_type VARCHAR(32) NOT NULL,
    internal_name VARCHAR(191) NOT NULL, display_name VARCHAR(255) NULL, description TEXT NULL, icon_key VARCHAR(500) NULL,
    properties_json JSON NULL, created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (id),
    UNIQUE KEY uq_mod_contents_public_id (public_id), UNIQUE KEY uq_mod_contents_identity (resource_version_id,content_type,internal_name),
    KEY idx_mod_contents_name (content_type,internal_name),
    CONSTRAINT fk_rcv2_mod_contents_version FOREIGN KEY (resource_version_id) REFERENCES resource_versions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS mod_content_aliases (
    id INT NOT NULL AUTO_INCREMENT, resource_id INT NOT NULL, content_type VARCHAR(32) NOT NULL,
    old_internal_name VARCHAR(191) NOT NULL, new_internal_name VARCHAR(191) NOT NULL, created_by_user_id INT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (id),
    UNIQUE KEY uq_mod_content_aliases_identity (resource_id,content_type,old_internal_name),
    KEY idx_mod_content_aliases_target (resource_id,content_type,new_internal_name),
    CONSTRAINT fk_rcv2_mod_content_alias_resource FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
    CONSTRAINT fk_rcv2_mod_content_alias_actor FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS mod_localizations (
    id INT NOT NULL AUTO_INCREMENT, resource_version_id INT NOT NULL, locale VARCHAR(32) NOT NULL,
    translated_count INT UNSIGNED NOT NULL DEFAULT 0, total_count INT UNSIGNED NOT NULL DEFAULT 0,
    percentage DECIMAL(5,2) NOT NULL DEFAULT 0, missing_keys_json JSON NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id), UNIQUE KEY uq_mod_localizations_locale (resource_version_id,locale),
    CONSTRAINT fk_rcv2_mod_localizations_version FOREIGN KEY (resource_version_id) REFERENCES resource_versions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS mod_compatibility_reports (
    id INT NOT NULL AUTO_INCREMENT, public_id CHAR(36) NOT NULL, resource_id INT NOT NULL, resource_version_id INT NOT NULL, user_id INT NOT NULL,
    status VARCHAR(32) NOT NULL, game_version VARCHAR(80) NULL, platform_key VARCHAR(50) NULL, runtime VARCHAR(24) NULL,
    body TEXT NULL, attachment_json JSON NULL, author_response_status VARCHAR(32) NULL, author_response TEXT NULL,
    fixed_resource_version_id INT NULL, created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (id),
    UNIQUE KEY uq_mod_compatibility_reports_public_id (public_id), UNIQUE KEY uq_mod_compatibility_reports_user_version (resource_version_id,user_id),
    KEY idx_mod_compatibility_reports_status (resource_id,status,created_at),
    CONSTRAINT fk_rcv2_mod_compat_reports_resource FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
    CONSTRAINT fk_rcv2_mod_compat_reports_version FOREIGN KEY (resource_version_id) REFERENCES resource_versions(id) ON DELETE CASCADE,
    CONSTRAINT fk_rcv2_mod_compat_reports_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_rcv2_mod_compat_reports_fixed FOREIGN KEY (fixed_resource_version_id) REFERENCES resource_versions(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS mod_issue_reports (
    id INT NOT NULL AUTO_INCREMENT, public_id CHAR(36) NOT NULL, resource_id INT NOT NULL, resource_version_id INT NOT NULL, user_id INT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'open', title VARCHAR(255) NOT NULL, body TEXT NOT NULL, attachment_json JSON NULL,
    author_response_status VARCHAR(32) NULL, author_response TEXT NULL, fixed_resource_version_id INT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id), UNIQUE KEY uq_mod_issue_reports_public_id (public_id), UNIQUE KEY uq_mod_issue_reports_version_user (resource_version_id,user_id), KEY idx_mod_issue_reports_resource_status (resource_id,status,created_at),
    CONSTRAINT fk_rcv2_mod_issues_resource FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
    CONSTRAINT fk_rcv2_mod_issues_version FOREIGN KEY (resource_version_id) REFERENCES resource_versions(id) ON DELETE CASCADE,
    CONSTRAINT fk_rcv2_mod_issues_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_rcv2_mod_issues_fixed FOREIGN KEY (fixed_resource_version_id) REFERENCES resource_versions(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS mod_conflict_reports (
    id INT NOT NULL AUTO_INCREMENT, public_id CHAR(36) NOT NULL, reporter_user_id INT NOT NULL, status VARCHAR(24) NOT NULL DEFAULT 'unverified',
    title VARCHAR(255) NULL, body TEXT NULL, game_version_min VARCHAR(80) NULL, game_version_max VARCHAR(80) NULL,
    author_response_status VARCHAR(32) NULL, author_response TEXT NULL, fixed_resource_version_id INT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id), UNIQUE KEY uq_mod_conflict_reports_public_id (public_id), KEY idx_mod_conflict_reports_status (status,created_at),
    CONSTRAINT fk_rcv2_mod_conflicts_reporter FOREIGN KEY (reporter_user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_rcv2_mod_conflicts_fixed FOREIGN KEY (fixed_resource_version_id) REFERENCES resource_versions(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS mod_conflict_members (
    id INT NOT NULL AUTO_INCREMENT, conflict_report_id INT NOT NULL, resource_id INT NOT NULL, resource_version_id INT NOT NULL,
    version_constraint VARCHAR(255) NULL, created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (id),
    UNIQUE KEY uq_mod_conflict_members_version (conflict_report_id,resource_version_id), KEY idx_mod_conflict_members_resource (resource_id),
    CONSTRAINT fk_rcv2_conflict_members_report FOREIGN KEY (conflict_report_id) REFERENCES mod_conflict_reports(id) ON DELETE CASCADE,
    CONSTRAINT fk_rcv2_conflict_members_resource FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
    CONSTRAINT fk_rcv2_conflict_members_version FOREIGN KEY (resource_version_id) REFERENCES resource_versions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS schematic_version_metadata (
    id INT NOT NULL AUTO_INCREMENT, resource_version_id INT NOT NULL, preview_key VARCHAR(500) NULL,
    width INT UNSIGNED NULL, height INT UNSIGNED NULL,
    block_count INT UNSIGNED NULL, content_hash CHAR(64) NULL, structure_hash CHAR(64) NULL, normalized_structure_hash CHAR(64) NULL,
    min_supported_build INT UNSIGNED NULL, schematic_format_version INT NULL, parser_version VARCHAR(100) NULL,
    dependencies_json JSON NULL, source_renderer_metadata_json JSON NULL, source_metadata_json JSON NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id), UNIQUE KEY uq_schematic_version_metadata_version (resource_version_id),
    KEY idx_schematic_metadata_structure_hash (structure_hash), KEY idx_schematic_metadata_normalized_hash (normalized_structure_hash),
    CONSTRAINT fk_rcv2_schematic_metadata_version FOREIGN KEY (resource_version_id) REFERENCES resource_versions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS schematic_blocks (
    id INT NOT NULL AUTO_INCREMENT, resource_version_id INT NOT NULL, internal_name VARCHAR(191) NOT NULL,
    display_name VARCHAR(255) NULL, count INT UNSIGNED NOT NULL DEFAULT 1, positions_json JSON NULL, properties_json JSON NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (id),
    UNIQUE KEY uq_schematic_blocks_version_name (resource_version_id,internal_name),
    CONSTRAINT fk_rcv2_schematic_blocks_version FOREIGN KEY (resource_version_id) REFERENCES resource_versions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS schematic_materials (
    id INT NOT NULL AUTO_INCREMENT, resource_version_id INT NOT NULL, internal_name VARCHAR(191) NOT NULL,
    amount BIGINT UNSIGNED NOT NULL DEFAULT 0, created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (id),
    UNIQUE KEY uq_schematic_materials_version_item (resource_version_id,internal_name),
    CONSTRAINT fk_rcv2_schematic_materials_version FOREIGN KEY (resource_version_id) REFERENCES resource_versions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS schematic_logic_processors (
    id INT NOT NULL AUTO_INCREMENT, resource_version_id INT NOT NULL, position_x INT NULL, position_y INT NULL,
    processor_type VARCHAR(64) NULL, links_json JSON NULL, variables_json JSON NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (id),
    UNIQUE KEY uq_schematic_logic_processors_position (resource_version_id,position_x,position_y),
    CONSTRAINT fk_rcv2_schematic_logic_version FOREIGN KEY (resource_version_id) REFERENCES resource_versions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS schematic_analyses (
    id INT NOT NULL AUTO_INCREMENT, resource_version_id INT NOT NULL, parser_version VARCHAR(100) NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'completed', complete TINYINT UNSIGNED NOT NULL DEFAULT 0,
    available TINYINT UNSIGNED NOT NULL DEFAULT 0, estimated TINYINT UNSIGNED NOT NULL DEFAULT 1,
    production_json JSON NULL, bottlenecks_json JSON NULL, warnings_json JSON NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id), UNIQUE KEY uq_schematic_analyses_version (resource_version_id),
    CONSTRAINT fk_rcv2_schematic_analyses_version FOREIGN KEY (resource_version_id) REFERENCES resource_versions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS map_version_metadata (
    id INT NOT NULL AUTO_INCREMENT, resource_version_id INT NOT NULL, preview_key VARCHAR(500) NULL,
    width INT UNSIGNED NULL, height INT UNSIGNED NULL,
    game_mode VARCHAR(100) NULL, game_modes_json JSON NULL, planet VARCHAR(100) NULL, player_count INT UNSIGNED NULL,
    playtime_seconds INT UNSIGNED NULL, game_version_min VARCHAR(80) NULL, game_version_max VARCHAR(80) NULL,
    rules_json JSON NULL, parser_version VARCHAR(100) NULL, source_renderer_metadata_json JSON NULL, source_metadata_json JSON NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id), UNIQUE KEY uq_map_version_metadata_version (resource_version_id),
    KEY idx_map_version_metadata_mode (game_mode,planet),
    CONSTRAINT fk_rcv2_map_metadata_version FOREIGN KEY (resource_version_id) REFERENCES resource_versions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS map_resource_entries (
    id INT NOT NULL AUTO_INCREMENT, resource_version_id INT NOT NULL, resource_type VARCHAR(32) NOT NULL,
    internal_name VARCHAR(191) NOT NULL, amount DECIMAL(14,4) NULL, distribution_json JSON NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (id),
    UNIQUE KEY uq_map_resource_entries_identity (resource_version_id,resource_type,internal_name),
    CONSTRAINT fk_rcv2_map_resources_version FOREIGN KEY (resource_version_id) REFERENCES resource_versions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS map_spawns (
    id INT NOT NULL AUTO_INCREMENT, resource_version_id INT NOT NULL, spawn_type VARCHAR(32) NOT NULL DEFAULT 'player',
    team VARCHAR(64) NULL, x INT NULL, y INT NULL, wave INT UNSIGNED NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (id), UNIQUE KEY uq_map_spawns_identity (resource_version_id,spawn_type,team,x,y,wave),
    CONSTRAINT fk_rcv2_map_spawns_version FOREIGN KEY (resource_version_id) REFERENCES resource_versions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS map_cores (
    id INT NOT NULL AUTO_INCREMENT, resource_version_id INT NOT NULL, core_type VARCHAR(32) NULL,
    team VARCHAR(64) NULL, x INT NULL, y INT NULL, created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id), UNIQUE KEY uq_map_cores_identity (resource_version_id,core_type,team,x,y),
    CONSTRAINT fk_rcv2_map_cores_version FOREIGN KEY (resource_version_id) REFERENCES resource_versions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS map_wave_summaries (
    id INT NOT NULL AUTO_INCREMENT, resource_version_id INT NOT NULL, wave_start INT UNSIGNED NOT NULL, wave_end INT UNSIGNED NOT NULL,
    enemy_count INT UNSIGNED NULL, estimated_health BIGINT UNSIGNED NULL, air_ratio DECIMAL(6,3) NULL,
    boss_count INT UNSIGNED NOT NULL DEFAULT 0, strength DECIMAL(12,3) NULL, is_spike TINYINT UNSIGNED NOT NULL DEFAULT 0,
    details_json JSON NULL, created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (id),
    UNIQUE KEY uq_map_wave_summaries_range (resource_version_id,wave_start,wave_end),
    KEY idx_map_wave_summaries_boss (resource_version_id,boss_count),
    CONSTRAINT fk_rcv2_map_waves_version FOREIGN KEY (resource_version_id) REFERENCES resource_versions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS map_analyses (
    id INT NOT NULL AUTO_INCREMENT, resource_version_id INT NOT NULL, parser_version VARCHAR(100) NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'completed', difficulty_confidence VARCHAR(24) NOT NULL DEFAULT 'estimated',
    estimated_difficulty DECIMAL(8,3) NULL, resource_balance_json JSON NULL, path_analysis_json JSON NULL, warnings_json JSON NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id), UNIQUE KEY uq_map_analyses_version (resource_version_id),
    CONSTRAINT fk_rcv2_map_analyses_version FOREIGN KEY (resource_version_id) REFERENCES resource_versions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS map_feedback (
    id INT NOT NULL AUTO_INCREMENT, resource_id INT NOT NULL, resource_version_id INT NOT NULL, user_id INT NOT NULL,
    difficulty TINYINT UNSIGNED NULL, resource_sufficiency TINYINT UNSIGNED NULL, balance TINYINT UNSIGNED NULL,
    multiplayer_experience TINYINT UNSIGNED NULL, body TEXT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id), UNIQUE KEY uq_map_feedback_version_user (resource_version_id,user_id), KEY idx_map_feedback_resource (resource_id,created_at),
    CONSTRAINT fk_rcv2_map_feedback_resource FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
    CONSTRAINT fk_rcv2_map_feedback_version FOREIGN KEY (resource_version_id) REFERENCES resource_versions(id) ON DELETE CASCADE,
    CONSTRAINT fk_rcv2_map_feedback_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

const tableNames = [
  'resource_members', 'resource_relations', 'resource_review_events', 'resource_review_annotations',
  'resource_analysis_runs', 'resource_analysis_overrides', 'resource_compatibilities', 'resource_dependencies',
  'resource_version_diffs', 'resource_source_syncs', 'mod_profiles', 'mod_id_aliases', 'mod_version_metadata',
  'mod_contents', 'mod_content_aliases', 'mod_localizations', 'mod_compatibility_reports', 'mod_issue_reports',
  'mod_conflict_reports', 'mod_conflict_members', 'schematic_version_metadata', 'schematic_blocks',
  'schematic_materials', 'schematic_logic_processors', 'schematic_analyses', 'map_version_metadata',
  'map_resource_entries', 'map_spawns', 'map_cores', 'map_wave_summaries', 'map_analyses', 'map_feedback',
];

const columnsToAdd = [
  ['version_mode', "VARCHAR(24) NOT NULL DEFAULT 'compatibility'"],
  ['revision', 'INT UNSIGNED NOT NULL DEFAULT 1'],
  ['recommended', 'TINYINT UNSIGNED NOT NULL DEFAULT 0'],
  ['game_version_min', 'VARCHAR(80) NULL'],
  ['game_version_max', 'VARCHAR(80) NULL'],
] as const;

export class ResourceCenterV21720000270000 implements MigrationInterface {
  name = 'ResourceCenterV21720000270000';
  transaction = false;

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await tableExists(queryRunner, 'resource_versions')) {
      for (const [name, definition] of columnsToAdd) await addColumnIfMissing(queryRunner, 'resource_versions', name, definition);
      // Legacy strings are preserved as compatibility versions unless they have
      // an unambiguous SemVer shape. Channel values (including `stable`) are not rewritten.
      await queryRunner.query(`UPDATE resource_versions SET version_mode = CASE
        WHEN version REGEXP '^[vV]?[0-9]+\\.[0-9]+\\.[0-9]+([+-][0-9A-Za-z.-]+)?$' THEN 'semver'
        ELSE 'compatibility' END WHERE version_mode = 'compatibility'`);
      await this.assignRevisionsToLegacyDuplicates(queryRunner);
      await addUniqueIfMissing(queryRunner, 'resource_versions', 'uq_resource_versions_resource_version_revision', ['resource_id', 'version', 'revision']);
      await createIndexIfMissing(queryRunner, 'resource_versions', 'idx_resource_versions_recommended', ['resource_id', 'recommended', 'status', 'published_at']);
      await createIndexIfMissing(queryRunner, 'resource_versions', 'idx_resource_versions_channel', ['resource_id', 'release_channel', 'status']);
      await this.dropLegacyVersionUnique(queryRunner);
    }

    for (const statement of tables) await queryRunner.query(statement);
    if (await tableExists(queryRunner, 'resource_relations')) {
      await addColumnIfMissing(queryRunner, 'resource_relations', 'relation_context', "VARCHAR(32) NOT NULL DEFAULT 'general'");
      await dropIndexIfPresent(queryRunner, 'resource_relations', 'uq_resource_relations_pair');
      await addUniqueIfMissing(queryRunner, 'resource_relations', 'uq_resource_relations_pair_context', ['source_resource_id', 'target_resource_id', 'relation_type', 'relation_context']);
    }
    await addColumnIfMissing(queryRunner, 'schematic_version_metadata', 'preview_key', 'VARCHAR(500) NULL');
    await addColumnIfMissing(queryRunner, 'map_version_metadata', 'preview_key', 'VARCHAR(500) NULL');
    await this.seedOwnerMembers(queryRunner);
    await this.copyLegacyDependencies(queryRunner);
    await this.copyLegacyCompatibilities(queryRunner);
  }

  private async seedOwnerMembers(queryRunner: QueryRunner): Promise<void> {
    if (!(await tableExists(queryRunner, 'resources'))
      || !(await tableExists(queryRunner, 'resource_members'))
      || !(await columnExists(queryRunner, 'resources', 'user_id'))) return;
    await queryRunner.query(`INSERT IGNORE INTO resource_members
      (resource_id,user_id,role,status,accepted_at)
      SELECT id,user_id,'owner','active',NOW(6) FROM resources WHERE user_id IS NOT NULL`);
  }

  private async assignRevisionsToLegacyDuplicates(queryRunner: QueryRunner): Promise<void> {
    const duplicates = await queryRunner.query(`SELECT resource_id, version
      FROM resource_versions GROUP BY resource_id, version HAVING COUNT(*) > 1`);
    for (const group of duplicates || []) {
      const rows = await queryRunner.query(
        'SELECT id FROM resource_versions WHERE resource_id = ? AND version = ? ORDER BY id ASC',
        [group.resource_id, group.version],
      );
      // Databases without the historical unique index can contain duplicate
      // version strings. Preserve every row as a deterministic revision.
      for (let index = 0; index < (rows || []).length; index += 1) {
        await queryRunner.query('UPDATE resource_versions SET revision = ? WHERE id = ?', [index + 1, rows[index].id]);
      }
    }
  }

  private async dropLegacyVersionUnique(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('resource_versions');
    for (const index of table?.indices || []) {
      const columns = index.columnNames || [];
      if (index.isUnique && index.name !== 'PRIMARY' && columns.length === 2
        && columns[0] === 'resource_id' && columns[1] === 'version') {
        await queryRunner.dropIndex('resource_versions', index);
      }
    }
  }

  private async copyLegacyDependencies(queryRunner: QueryRunner): Promise<void> {
    if (!(await tableExists(queryRunner, 'resource_version_dependencies'))
      || !(await tableExists(queryRunner, 'resource_dependencies'))) return;
    await queryRunner.query(`INSERT IGNORE INTO resource_dependencies
      (resource_version_id,dependency_type,target_resource_id,external_identifier,version_constraint,notes,sort_order,legacy_source_id,created_at)
      SELECT resource_version_id,dependency_type,target_resource_id,external_identifier,version_constraint,notes,sort_order,id,created_at
      FROM resource_version_dependencies`);
  }

  private async copyLegacyCompatibilities(queryRunner: QueryRunner): Promise<void> {
    if (!(await tableExists(queryRunner, 'resource_version_compatibilities'))
      || !(await tableExists(queryRunner, 'resource_compatibilities'))) return;
    const sourceExpr = await columnExists(queryRunner, 'resource_version_compatibilities', 'provenance')
      ? `CASE WHEN provenance IN ('inferred','file_metadata') THEN 'analyzer' ELSE 'author' END`
      : "'author'";
    const confidenceExpr = await columnExists(queryRunner, 'resource_version_compatibilities', 'confidence')
      ? 'confidence' : 'NULL';
    const gameVersionExpr = await columnExists(queryRunner, 'resource_version_compatibilities', 'game_series')
      ? 'game_series' : 'NULL';
    await queryRunner.query(`INSERT IGNORE INTO resource_compatibilities
      (resource_version_id,source,runtime,platform_key,game_version,min_game_version,max_game_version,channel,confidence,notes,legacy_source_id,created_at)
      SELECT resource_version_id,${sourceExpr},runtime,platform_key,${gameVersionExpr},min_version_value,max_version_value,channel,${confidenceExpr},notes,id,created_at
      FROM resource_version_compatibilities`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await tableExists(queryRunner, 'resource_versions')) {
      const duplicate = await queryRunner.query(`SELECT resource_id,version FROM resource_versions
        GROUP BY resource_id,version HAVING COUNT(*) > 1 LIMIT 1`);
      if (duplicate?.length) {
        throw new Error('Cannot revert Resource Center V2 while multiple revisions of a version exist; export or consolidate revisions first.');
      }
    }

    for (const tableName of [...tableNames].reverse()) {
      await queryRunner.query(`DROP TABLE IF EXISTS \`${tableName}\``);
    }

    if (await tableExists(queryRunner, 'resource_versions')) {
      await dropIndexIfPresent(queryRunner, 'resource_versions', 'uq_resource_versions_resource_version_revision');
      await dropIndexIfPresent(queryRunner, 'resource_versions', 'idx_resource_versions_recommended');
      await dropIndexIfPresent(queryRunner, 'resource_versions', 'idx_resource_versions_channel');
      await addUniqueIfMissing(queryRunner, 'resource_versions', 'uq_resource_versions_resource_version', ['resource_id', 'version']);
      for (const [name] of [...columnsToAdd].reverse()) {
        if (await columnExists(queryRunner, 'resource_versions', name)) await queryRunner.dropColumn('resource_versions', name);
      }
    }
  }
}
