import type { Resource } from '@/types';
import { buildHybridParam } from '@/lib/seo/hybrid-param';

/** Build the page URL from the numeric ID accepted by the resource detail route. */
export function resourceDetailHref(resource: Pick<Resource, 'id' | 'slug'>): string {
  return `/resources/${buildHybridParam(resource.id, resource.slug || '')}`;
}
