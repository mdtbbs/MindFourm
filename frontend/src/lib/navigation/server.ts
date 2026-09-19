import 'server-only';

import { fetchV1 } from '@/lib/api/v1/transport';
import { EMPTY_NAVIGATION, type NavigationSnapshot } from './types';

export const NAVIGATION_CACHE_TAG = 'navigation';

/** Fetch the complete navigation snapshot once for the SSR layout. */
export async function fetchNavigation(): Promise<NavigationSnapshot> {
  try {
    return await fetchV1<NavigationSnapshot>('/navigation', {
      init: { next: { tags: [NAVIGATION_CACHE_TAG], revalidate: 3600 } },
    });
  } catch {
    // A navigation outage must not turn every public route into a 500.
    return EMPTY_NAVIGATION;
  }
}
