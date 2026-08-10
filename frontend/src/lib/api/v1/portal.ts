/**
 * V1 Portal API client.
 *
 * Fetches the aggregated homepage/portal data from `/api/v1/portal`.
 * The portal response is a list of typed modules (e.g. hot posts,
 * featured resources) that the homepage renders as independent blocks.
 * Returns the unwrapped `data` payload; the V1 envelope is handled
 * by the transport layer.
 */

import { fetchV1, type FetchV1Options } from './transport';

export type PortalModule = {
  key: string;
  title: string;
  hidden: boolean;
  items: Array<Record<string, unknown>>;
};

export type PortalData = {
  modules: PortalModule[];
  generated_at: string;
};

export async function getPortalData(
  options?: FetchV1Options,
): Promise<PortalData> {
  return fetchV1<PortalData>('/portal', options);
}
