const API_BASE = process.env.API_URL || 'http://localhost:4000';

export default async function robots() {
  let settings: Record<string, string> = {};
  try {
    const res = await fetch(`${API_BASE}/api/settings`, { next: { revalidate: 60 } });
    if (res.ok) {
      const json = await res.json();
      if (json.success) settings = json.data;
    }
  } catch {
    // If settings API fails, return default allow
  }

  const enabled = settings.seo_robots_enabled !== 'false';
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:4000';

  if (enabled) {
    return {
      rules: [
        {
          userAgent: '*',
          allow: '/',
          disallow: ['/admin/', '/api/'],
        },
      ],
      sitemap: `${baseUrl}/sitemap.xml`,
    };
  }

  return {
    rules: [
      {
        userAgent: '*',
        disallow: '/',
      },
    ],
  };
}
