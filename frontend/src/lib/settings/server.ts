import 'server-only';

import { fetchApiData } from '@/lib/api/server-fetch';

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
