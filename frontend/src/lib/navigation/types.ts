import type { Category, ResourceCategory } from '@/types';

export type NavigationLink = {
  label: string;
  href: string;
  description?: string;
};

export type FeaturedTag = {
  id: number;
  name: string;
  slug: string;
  post_count: number;
};

/** The public `/api/v1/navigation` contract consumed by every site shell. */
export type NavigationSnapshot = {
  forumCategories: Category[];
  /** Resource taxonomy categories. `resourceTypes` is accepted only at the API boundary for compatibility. */
  resourceCategories: ResourceCategory[];
  featuredTags: FeaturedTag[];
  links: NavigationLink[];
};

export const EMPTY_NAVIGATION: NavigationSnapshot = {
  forumCategories: [],
  resourceCategories: [],
  featuredTags: [],
  links: [],
};

/** Normalize the legacy public transport field to the ResourceCategory domain name. */
export function normalizeNavigationSnapshot(payload: Partial<NavigationSnapshot> & { resourceTypes?: ResourceCategory[] }): NavigationSnapshot {
  return {
    forumCategories: payload.forumCategories || [],
    resourceCategories: payload.resourceCategories || payload.resourceTypes || [],
    featuredTags: payload.featuredTags || [],
    links: payload.links || [],
  };
}
