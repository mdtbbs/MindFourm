/**
 * V1 Resources API client.
 *
 * Thin wrapper over `fetchV1` for the resource detail endpoint. The
 * shape here mirrors the backend's V1 DTO so callers can rely on the
 * exact field names — no camelCase conversion, no optional fallbacks.
 */

import { fetchV1, type FetchV1Options } from './transport';

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
  id: number,
  options?: FetchV1Options,
): Promise<V1ResourceDetail> {
  return fetchV1<V1ResourceDetail>(`/resources/${id}`, options);
}
