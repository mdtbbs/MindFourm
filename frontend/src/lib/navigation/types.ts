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
  resourceTypes: ResourceCategory[];
  featuredTags: FeaturedTag[];
  links: NavigationLink[];
};

export const EMPTY_NAVIGATION: NavigationSnapshot = {
  forumCategories: [],
  resourceTypes: [],
  featuredTags: [],
  links: [],
};
