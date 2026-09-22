import 'server-only';

import { fetchV1 } from '@/lib/api/v1/transport';
import { EMPTY_NAVIGATION, normalizeNavigationSnapshot, type NavigationSnapshot } from './types';

export const NAVIGATION_CACHE_TAG = 'navigation';

/** Fetch the complete navigation snapshot once for the SSR layout. */
export async function fetchNavigation(): Promise<NavigationSnapshot> {
  try {
    const payload = await fetchV1<NavigationSnapshot & { resourceTypes?: NavigationSnapshot['resourceCategories'] }>('/navigation', {
      init: { next: { tags: [NAVIGATION_CACHE_TAG], revalidate: 3600 } },
    });
    // The public API historically named ResourceCategory records `resourceTypes`.
    // Keep that transport shape compatible while the application uses the correct domain name.
    return normalizeNavigationSnapshot(payload);
  } catch {
    // A navigation outage must not turn every public route into a 500.
    return EMPTY_NAVIGATION;
  }
}
