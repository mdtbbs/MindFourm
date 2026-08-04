import 'server-only';

import { fetchApiData } from '@/lib/api/server-fetch';

export const SETTINGS_CACHE_TAG = 'settings';

export async function fetchPublicSettings(): Promise<Record<string, string>> {
  return fetchApiData<Record<string, string>>('/api/settings', {
    init: { next: { tags: [SETTINGS_CACHE_TAG], revalidate: 300 } },
    fallback: {},
  });
}
