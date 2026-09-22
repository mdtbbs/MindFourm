/**
 * V1 Resources API client.
 *
 * Thin wrapper over `fetchV1` for the resource detail endpoint. The
 * shape here mirrors the backend's V1 DTO so callers can rely on the
 * exact field names — no camelCase conversion, no optional fallbacks.
 */

import { fetchV1, type FetchV1Options } from './transport';

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

export type V1ResourceListItem = Omit<V1ResourceDetail, 'attributions'>;

export type V1ResourceManifest = {
  resource_public_id: string;
  resource_kind: string;
  versions: Array<{
    public_id: string;
    version: string;
    display_version: string;
    release_channel: string;
    published_at: string | null;
    compatibility: Array<{
      runtime: string;
      game_series: string | null;
      min_version: string | null;
      max_version: string | null;
      channel: string | null;
      platform: string | null;
    }>;
    dependencies: Array<{
      dependency_type: string;
      resource_public_id: string | null;
      external_identifier: string | null;
      version_constraint: string | null;
      notes: string | null;
    }>;
    files: Array<{
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
    }>;
  }>;
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
  map?: {
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
  schematic?: {
    name: string | null;
    description: string | null;
    width: number | null;
    height: number | null;
    blocks: number | null;
    requirements: unknown[];
  };
  mod?: {
    mod_id: string | null;
    version: string | null;
    game_versions: string[];
    dependencies: unknown[];
  };
};

/**
 * Fetch a single resource by id via the V1 endpoint.
 *
 * Returns the unwrapped `data` payload — the `meta: { request_id }`
 * envelope is handled by the transport layer.
 *
 * Pass `options.cookies` when calling from a server component so the
 * user's session is forwarded to the backend.
 */
export async function getResourceV1(
  publicId: string,
  options?: FetchV1Options,
): Promise<V1ResourceDetail> {
  return fetchV1<V1ResourceDetail>(`/resources/${encodeURIComponent(publicId)}`, options);
}

export async function getResourceManifestV1(
  publicId: string,
  options?: FetchV1Options,
): Promise<V1ResourceManifest> {
  return fetchV1<V1ResourceManifest>(`/resources/${encodeURIComponent(publicId)}/manifest`, options);
}

export async function listResourcesV1(
  params: { limit?: number; offset?: number; query?: string } = {},
  options?: FetchV1Options,
): Promise<{ items: V1ResourceListItem[]; pagination: { limit: number; offset: number; next_offset: number | null; has_more: boolean } }> {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.offset !== undefined) query.set('offset', String(params.offset));
  if (params.query) query.set('q', params.query);
  return fetchV1(`/resources${query.toString() ? `?${query.toString()}` : ''}`, options);
}
