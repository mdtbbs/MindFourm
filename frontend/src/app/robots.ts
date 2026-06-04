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
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL;

  // Security: Require proper URL in production, don't expose localhost
  if (!baseUrl) {
    if (process.env.NODE_ENV === 'production') {
      // Return empty robots.txt in production without proper URL config
      return { rules: [] };
    }
    // Development: use localhost but don't expose in sitemap
    return {
      rules: [{ userAgent: '*', allow: '/', disallow: '/api/' }],
    };
  }

  if (enabled) {
    // Security: Only list ALLOWED public paths, don't advertise sensitive paths
    // Rationale: Disallowing /admin/ tells attackers "look here"
    // Instead, rely on authentication for sensitive areas
    return {
      rules: [
        {
          userAgent: '*',
          allow: ['/', '/posts', '/categories', '/tags', '/users', '/resources', '/servers'],
          // Don't explicitly disallow anything - let auth handle sensitive areas
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
