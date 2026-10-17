import 'server-only';

import { fetchApiData } from '@/lib/api/server-fetch';
import { siteProfile } from '@/config/site-profile';

export const SETTINGS_CACHE_TAG = 'settings';

export async function fetchPublicSettings(options: { fresh?: boolean } = {}): Promise<Record<string, string>> {
  return fetchApiData<Record<string, string>>('/api/settings', {
    // Legal and information pages are administrator-authored content.  They
    // must reflect a save immediately instead of waiting for the shared
    // settings cache to expire or for an internal revalidation callback.
    init: options.fresh
      ? { cache: 'no-store' }
      : { next: { tags: [SETTINGS_CACHE_TAG], revalidate: 300 } },
    fallback: {},
  });
}

/**
 * Site name for server-rendered legal bodies.
 *
 * These pages have to stay statically prerenderable, and at build time the
 * loopback API is intentionally skipped, so they cannot await settings on the
 * server. They only need the brand name, which is a build-time constant per
 * deployment: `site_name` is deployment configuration, not admin content.
 * Runtime overrides are still honoured on the client by `SettingsProvider`.
 */
export function getServerSiteName(): string {
  return siteProfile.branding.siteName;
}
