/**
 * V1 Resource DTOs.
 *
 * These are the public API shapes. They mirror the internal V1ResourceDto
 * from ResourceReadAdapterService but are defined separately so the API
 * contract can evolve independently.
 */

export type V1ResourceListItem = {
  public_id: string;
  title: string;
  summary: string;
  resource_kind: string;
  visibility: string;
  metadata: V1ResourceMetadata;
  latest_version: V1VersionSummary | null;
  download_count: number;
};

export type V1ResourceDetail = {
  public_id: string;
  title: string;
  summary: string;
  content: string | null;
  content_format: 'tiptap_json';
  content_schema_version: number;
  content_json: Record<string, unknown> | null;
  content_html: string | null;
  content_text: string | null;
  resource_kind: string;
  visibility: string;
  metadata: V1ResourceMetadata;
  latest_version: V1VersionSummary | null;
  attributions: V1AttributionSummary[];
  download_count: number;
};

export type V1ResourceManifest = {
  schema_version: 1;
  type: string;
  resource: { public_id: string; name: string };
  resource_public_id: string;
  resource_kind: string;
  versions: V1ManifestVersion[];
};

export type V1ManifestVersion = {
  public_id: string;
  version: string;
  display_version: string;
  release_channel: string;
  published_at: string | null;
  compatibility: V1ManifestCompatibility[];
  dependencies: V1ManifestDependency[];
  files: V1ManifestFile[];
};

export type V1ManifestCompatibility = {
  runtime: string;
  game_series: string | null;
  min_version: string | null;
  max_version: string | null;
  channel: string | null;
  platform: string | null;
  provenance: 'file_metadata' | 'inferred' | 'user_declared' | 'verified' | 'admin_verified';
  confidence: 'low' | 'medium' | 'high' | null;
};

export type V1ManifestDependency = {
  dependency_type: string;
  resource_public_id: string | null;
  external_identifier: string | null;
  version_constraint: string | null;
  notes: string | null;
};

export type V1ManifestFile = {
  public_id: string;
  role: string;
  delivery_mode: string;
  platform: string | null;
  architecture: string | null;
  package_type: string | null;
  display_name: string | null;
  original_filename: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  hash_algorithm: string | null;
  content_hash: string | null;
  integrity_status: string;
  availability_status: string;
  downloadable: boolean;
  installable: boolean;
  download_url: string;
};

export type V1ResourceMetadata = {
  schema_version: 1;
  tags: string[];
  supported_versions: string[];
  compatibility: string[];
  preview: {
    url: string | null;
    status: 'processing' | 'ready' | 'failed' | 'unavailable' | 'none';
  };
  map?: V1MapMetadata;
  schematic?: V1SchematicMetadata;
  mod?: V1ModMetadata;
};

export type V1MapMetadata = {
  name: string | null;
  author: string | null;
  description: string | null;
  width: number | null;
  height: number | null;
  spawns: number | null;
  version: number | null;
  build: number | null;
  save_format_version: number | null;
  stored_game_build: number | null;
  build_source: 'file_metadata' | 'unknown';
  parser_runtime: Record<string, unknown>;
  planets: string[];
  game_modes: string[];
  tags: string[];
  teams: string[];
  rules: Record<string, unknown>;
  waves: boolean | null;
  wave_groups: unknown[];
  banned_blocks: string[];
  banned_units: string[];
  core_count: number | null;
  cores: unknown[];
  core_teams: string[];
  tile_layers: Record<string, unknown>;
  tile_layers_truncated: boolean;
  required_mods: string[];
};

export type V1SchematicMetadata = {
  name: string | null;
  description: string | null;
  width: number | null;
  height: number | null;
  blocks: number | null;
  block_types: unknown[];
  block_positions: unknown[];
  block_positions_truncated: boolean;
  requirements: unknown[];
  power_production: number | null;
  power_consumption: number | null;
  net_power: number | null;
  planet: string | null;
  labels: string[];
  required_mods: string[];
  schematic_format_version: number | null;
  parser_runtime: Record<string, unknown>;
  compatibility_inference: {
    minimum_supported_build: number | null;
    source: 'inferred' | 'unknown';
    confidence: 'low' | 'medium' | 'high';
    unknown_content: string[];
  };
  structure_hashes: { exact: string | null; normalized: string | null };
};

export type V1ModMetadata = {
  mod_id: string | null;
  version: string | null;
  game_versions: string[];
  dependencies: unknown[];
};

export type V1VersionSummary = {
  public_id: string;
  version: string;
  display_version: string;
  status: string;
  is_legacy_root_release: boolean;
  file_count: number;
};

export type V1AttributionSummary = {
  id: number;
  role: string;
  subject_type: string;
  display_name: string | null;
};
