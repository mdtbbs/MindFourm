import type { PostSummary, Category, Resource } from '@/types';
import { createEmptyPaginatedResult } from '@/lib/api/response';
import { fetchApiData, fetchApiPaginated } from '@/lib/api/server-fetch';

async function fetchSitemapPosts(limit: number = 1000): Promise<PostSummary[]> {
  const pageSize = 50;
  const totalPages = Math.ceil(limit / pageSize);
  const posts: PostSummary[] = [];

  for (let page = 1; page <= totalPages; page += 1) {
    const result = await fetchApiPaginated<PostSummary>(`/api/posts?page=${page}&limit=${pageSize}`, {
      init: { next: { revalidate: 60 } },
      fallback: createEmptyPaginatedResult<PostSummary>(pageSize),
    });

    posts.push(...result.data);

    if (result.pagination.page >= result.pagination.totalPages || result.data.length < pageSize) {
      break;
    }
  }

  return posts.slice(0, limit);
}

async function fetchSitemapCategories(): Promise<Category[]> {
  return fetchApiData<Category[]>('/api/categories', {
    init: { next: { revalidate: 300 } },
    fallback: [],
  });
}

async function fetchSitemapResources(limit: number = 500): Promise<Resource[]> {
  const result = await fetchApiData<{ data: Resource[]; next_cursor: string | null; has_more: boolean }>(
    '/api/resources?limit=50',
    {
      init: { next: { revalidate: 60 } },
      fallback: { data: [], next_cursor: null, has_more: false },
    },
  );

  return result.data.slice(0, limit);
}

export default async function sitemap() {
  const settings = await fetchApiData<Record<string, string>>('/api/settings', {
    init: { next: { revalidate: 60 } },
    fallback: {},
  });

  if (settings.seo_sitemap_enabled === 'false') {
    return [];
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || settings.site_url;

  // Security: Require proper URL in production, don't expose localhost
  if (!baseUrl) {
    if (process.env.NODE_ENV === 'production') {
      console.error('Security: NEXT_PUBLIC_SITE_URL or site_url setting is required in production for sitemap');
      return [];
    }
    return [];
  }

  // Static pages
  const staticUrls = [
    { url: baseUrl, lastModified: new Date().toISOString() },
    { url: `${baseUrl}/resources`, lastModified: new Date().toISOString() },
  ];

  // Fetch all data in parallel
  const [posts, categories, resources] = await Promise.all([
    fetchSitemapPosts(),
    fetchSitemapCategories(),
    fetchSitemapResources(),
  ]);

  // Category URLs
  const categoryUrls = categories.map((category) => ({
    url: `${baseUrl}/categories/${category.slug || category.id}`,
    lastModified: new Date().toISOString(),
  }));

  // Post URLs - use slug-based hybrid URLs
  const postUrls = posts.map((post) => ({
    url: `${baseUrl}/posts/${post.id}${post.slug ? `-${post.slug}` : ''}`,
    lastModified: post.updated_at || post.created_at,
  }));

  // Resource URLs
  const resourceUrls = resources.map((resource) => ({
    url: `${baseUrl}/resources/${resource.id}${resource.slug ? `-${resource.slug}` : ''}`,
    lastModified: resource.updated_at || resource.created_at,
  }));

  return [...staticUrls, ...categoryUrls, ...postUrls, ...resourceUrls];
}
