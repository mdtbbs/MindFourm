import type { MetadataRoute } from 'next';
import type { PostSummary, Category, Resource, Tag } from '@/types';
import { createEmptyPaginatedResult } from '@/lib/api/response';
import { fetchApiData, fetchApiPaginated } from '@/lib/api/server-fetch';
import { fetchPublicSettings } from '@/lib/settings/server';
import { getSiteUrl } from '@/lib/seo/site-url';
import { buildHybridParam } from '@/lib/seo/hybrid-param';

const POST_LIMIT = 5000;
const RESOURCE_LIMIT = 1000;
const PAGE_SIZE = 50;

async function fetchSitemapPosts(limit: number = POST_LIMIT): Promise<PostSummary[]> {
  const totalPages = Math.ceil(limit / PAGE_SIZE);
  const posts: PostSummary[] = [];

  for (let page = 1; page <= totalPages; page += 1) {
    const result = await fetchApiPaginated<PostSummary>(`/api/posts?page=${page}&limit=${PAGE_SIZE}`, {
      init: { next: { revalidate: 60 } },
      fallback: createEmptyPaginatedResult<PostSummary>(PAGE_SIZE),
    });

    posts.push(...result.data);

    if (result.pagination.page >= result.pagination.totalPages || result.data.length < PAGE_SIZE) {
      break;
    }
  }

  if (posts.length >= limit) {
    console.warn(`sitemap: post list truncated at ${limit}; consider a sitemap index`);
  }

  return posts.slice(0, limit);
}

async function fetchSitemapCategories(): Promise<Category[]> {
  return fetchApiData<Category[]>('/api/categories', {
    init: { next: { revalidate: 300 } },
    fallback: [],
  });
}

async function fetchSitemapTags(): Promise<Tag[]> {
  return fetchApiData<Tag[]>('/api/tags', {
    init: { next: { revalidate: 300 } },
    fallback: [],
  });
}

/**
 * Walks the resource cursor. The previous version requested a single `?limit=50`
 * page while advertising a limit of 500, so it silently emitted at most 50 resources
 * no matter how many existed.
 */
async function fetchSitemapResources(limit: number = RESOURCE_LIMIT): Promise<Resource[]> {
  const resources: Resource[] = [];
  let cursor: string | null = null;

  while (resources.length < limit) {
    const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (cursor) query.set('cursor', cursor);

    const result: { data: Resource[]; next_cursor: string | null; has_more: boolean } =
      await fetchApiData(`/api/resources?${query.toString()}`, {
        init: { next: { revalidate: 60 } },
        fallback: { data: [], next_cursor: null, has_more: false },
      });

    resources.push(...result.data);

    if (!result.has_more || !result.next_cursor || result.data.length === 0) {
      break;
    }
    cursor = result.next_cursor;
  }

  return resources.slice(0, limit);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const settings = await fetchPublicSettings();

  // Matches the admin toggle, which renders `=== 'true'` as checked: anything unset
  // or blank now reads as disabled here too, instead of the two disagreeing.
  if ((settings.seo_sitemap_enabled ?? 'true') !== 'true') {
    return [];
  }

  // Only the environment variable — never the admin-editable `site_url`, which is
  // seeded to `http://localhost:3000` and so used to leak localhost URLs into a
  // production sitemap while bypassing the guard below.
  const baseUrl = getSiteUrl();
  if (!baseUrl) {
    console.error('sitemap: NEXT_PUBLIC_SITE_URL is required; returning an empty sitemap');
    return [];
  }

  const [posts, categories, tags, resources] = await Promise.all([
    fetchSitemapPosts(),
    fetchSitemapCategories(),
    fetchSitemapTags(),
    fetchSitemapResources(),
  ]);

  const staticUrls: MetadataRoute.Sitemap = [
    { url: baseUrl, changeFrequency: 'hourly', priority: 1 },
    { url: `${baseUrl}/resources`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${baseUrl}/notices`, changeFrequency: 'weekly', priority: 0.5 },
    { url: `${baseUrl}/categories`, changeFrequency: 'weekly', priority: 0.5 },
    { url: `${baseUrl}/about`, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${baseUrl}/thanks`, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${baseUrl}/terms`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${baseUrl}/privacy`, changeFrequency: 'yearly', priority: 0.2 },
  ];

  // Always the numeric id: there is no `/categories/[slug]` route, so emitting
  // `category.slug` published URLs that 404.
  const categoryUrls: MetadataRoute.Sitemap = categories.map((category) => ({
    url: `${baseUrl}/categories/${category.id}`,
    changeFrequency: 'daily',
    priority: 0.7,
  }));

  const tagUrls: MetadataRoute.Sitemap = tags
    .filter((tag) => !!tag.slug && (tag.post_count ?? 0) >= 3)
    .map((tag) => ({
      url: `${baseUrl}/tags/${tag.slug}`,
      changeFrequency: 'weekly',
      priority: 0.4,
    }));

  // Must match the canonical each page declares, and the links pointing at it.
  const postUrls: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${baseUrl}/posts/${buildHybridParam(post.id, post.slug || '')}`,
    lastModified: post.updated_at || post.created_at,
    changeFrequency: 'weekly',
    priority: 0.6,
  }));

  const resourceUrls: MetadataRoute.Sitemap = resources.map((resource) => ({
    url: `${baseUrl}/resources/${buildHybridParam(resource.id, resource.slug || '')}`,
    lastModified: resource.updated_at || resource.created_at,
    changeFrequency: 'weekly',
    priority: 0.6,
  }));

  return [...staticUrls, ...categoryUrls, ...tagUrls, ...postUrls, ...resourceUrls];
}
