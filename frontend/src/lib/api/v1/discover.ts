/**
 * V1 Discover API client.
 *
 * Fetches the community-wide summary from `/api/v1/discover` — recent
 * resources, threads, and active servers. Returns the unwrapped `data`
 * payload; the V1 envelope is handled by the transport layer.
 */

import { fetchV1, type FetchV1Options } from './transport';

export type DiscoverRecentItem = {
  id: number;
  title: string;
  created_at: string;
};

export type DiscoverActiveServer = {
  id: number;
  name: string;
  hostname: string;
  port: number;
};

export type DiscoverSummary = {
  total_resources: number;
  total_threads: number;
  total_servers: number;
  recent_resources: DiscoverRecentItem[];
  recent_threads: DiscoverRecentItem[];
  active_servers: DiscoverActiveServer[];
};

export async function getDiscoverSummary(
  options?: FetchV1Options,
): Promise<DiscoverSummary> {
  return fetchV1<DiscoverSummary>('/discover', options);
}
