/**
 * V1 Resource DTOs.
 *
 * These are the public API shapes. They mirror the internal V1ResourceDto
 * from ResourceReadAdapterService but are defined separately so the API
 * contract can evolve independently.
 */

export type V1ResourceListItem = {
  public_id: string | null;
  id: number;
  title: string;
  summary: string;
  resource_kind: string | null;
  visibility: string;
  download_count: number;
  has_versions: boolean;
};

export type V1ResourceDetail = {
  public_id: string | null;
  id: number;
  title: string;
  summary: string;
  resource_kind: string | null;
  visibility: string;
  latest_version: V1VersionSummary | null;
  attributions: V1AttributionSummary[];
  download_count: number;
};

export type V1VersionSummary = {
  public_id: string | null;
  id: number;
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
