import type { PostSummary } from '@/types';
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

export default async function sitemap() {
  const settings = await fetchApiData<Record<string, string>>('/api/settings', {
    init: { next: { revalidate: 60 } },
    fallback: {},
  });

  if (settings.seo_sitemap_enabled === 'false') {
    return [];
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL;

  // Security: Require proper URL in production, don't expose localhost
  if (!baseUrl) {
    if (process.env.NODE_ENV === 'production') {
      console.error('Security: NEXT_PUBLIC_SITE_URL is required in production for sitemap');
      return []; // Return empty sitemap rather than expose localhost
    }
    // Development: skip sitemap generation
    return [];
  }

  // Static pages
  const staticUrls = [
    { url: baseUrl, lastModified: new Date().toISOString() },
  ];

  // Fetch posts for sitemap
  const postUrls = (await fetchSitemapPosts()).map((post) => ({
    url: `${baseUrl}/posts/${post.id}`,
    lastModified: post.updated_at || post.created_at,
  }));

  return [...staticUrls, ...postUrls];
}
