const API_BASE = process.env.API_URL || 'http://localhost:4000';

export default async function sitemap() {
  let settings: Record<string, string> = {};
  try {
    const res = await fetch(`${API_BASE}/api/settings`, { next: { revalidate: 60 } });
    if (res.ok) {
      const json = await res.json();
      if (json.success) settings = json.data;
    }
  } catch {
    // If settings API fails, generate sitemap anyway
  }

  if (settings.seo_sitemap_enabled === 'false') {
    return [];
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:4000';

  // Static pages
  const staticUrls = [
    { url: baseUrl, lastModified: new Date().toISOString() },
  ];

  // Fetch posts for sitemap
  let postUrls: { url: string; lastModified: string }[] = [];
  try {
    const res = await fetch(`${API_BASE}/api/v1/posts?page=1&limit=1000`, { next: { revalidate: 60 } });
    if (res.ok) {
      const json = await res.json();
      if (json.success && json.data) {
        postUrls = json.data.map((post: any) => ({
          url: `${baseUrl}/posts/${post.id}`,
          lastModified: post.updated_at || post.created_at,
        }));
      }
    }
  } catch {
    // Skip post URLs if fetch fails
  }

  return [...staticUrls, ...postUrls];
}
