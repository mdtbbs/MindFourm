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
  resource_kind: string;
  visibility: string;
  metadata: V1ResourceMetadata;
  latest_version: V1VersionSummary | null;
  attributions: V1AttributionSummary[];
  download_count: number;
};

export type V1ResourceManifest = {
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
  planets: string[];
  game_modes: string[];
  required_mods: string[];
};

export type V1SchematicMetadata = {
  name: string | null;
  description: string | null;
  width: number | null;
  height: number | null;
  blocks: number | null;
  requirements: unknown[];
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
