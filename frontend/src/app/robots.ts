import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/seo/site-url';
import { fetchPublicSettings } from '@/lib/settings/server';

/**
 * Paths that produce unbounded thin or duplicate content.
 *
 * Deliberately omits `/admin` and other gated areas — disallowing them would
 * advertise where to look, and authentication already protects them. Nothing listed
 * here is sensitive; it simply is not worth indexing.
 */
const DISALLOWED_PATHS = [
  // `/search?q=<anything>` is an infinite duplicate-content surface.
  '/search',
  // Session-scoped; a crawler only ever sees the signed-out shell.
  '/notifications',
  '/bookmarks',
  '/messages',
  '/settings',
  // Internal Next-only endpoints are guarded and not documents.
  '/internal/',
  // API responses are not documents.
  '/api/',
];

export default async function robots(): Promise<MetadataRoute.Robots> {
  const settings = await fetchPublicSettings();

  // Matches the admin toggle, which renders `=== 'true'` as checked. Reading this as
  // `!== 'false'` meant an unset value showed as off in the UI while behaving as on.
  const enabled = (settings.seo_robots_enabled ?? 'true') === 'true';

  if (!enabled) {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }

  const rules = [{ userAgent: '*', allow: '/', disallow: DISALLOWED_PATHS }];

  // Without a canonical origin there is no correct absolute sitemap URL to publish.
  const baseUrl = getSiteUrl();
  if (!baseUrl) {
    if (process.env.NODE_ENV === 'production') {
      console.error('robots: NEXT_PUBLIC_SITE_URL is required in production');
    }
    return { rules };
  }

  return {
    rules,
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
